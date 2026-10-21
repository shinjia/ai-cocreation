<?php
/**
 * Private, bounded upload foundation. The browser must first materialize JPEG
 * or PNG pixels as an 8-bit, non-interlaced RGB/RGBA PNG no larger than 2048px
 * on either side. This function neither trusts a MIME label nor reads a file.
 *
 * png-v1 preserves the exact filtered scanline bytes, not metadata, filenames,
 * palette/transparency chunks, color profiles or the original compressed stream.
 * A fresh single IDAT prevents accepted compressed trailing bytes from surviving
 * normalization. This is not a claim that the source zlib stream was canonical.
 * Callers provide ensure() and AppError from validation.php.
 */

function pngUploadMemoryLimitBytes($setting) {
    ensure(is_string($setting),'PNG_RUNTIME_UNAVAILABLE','無法確認伺服器的圖片處理記憶體限制，未處理圖片。',503);
    $setting=trim($setting);
    if($setting==='-1')return null;
    ensure(preg_match('/^([0-9]+)([KMG]?)$/iD',$setting,$matches)===1,'PNG_RUNTIME_UNAVAILABLE','伺服器的記憶體限制格式無法安全確認，未處理圖片。',503);
    $suffix=strtoupper($matches[2]);$factor=$suffix==='G'?1073741824:($suffix==='M'?1048576:($suffix==='K'?1024:1));
    $bytes=(float)$matches[1]*$factor;
    // Reject overflow/ambiguous configuration rather than guessing available RAM.
    ensure(is_finite($bytes)&&$bytes>0&&$bytes<(float)PHP_INT_MAX,'PNG_RUNTIME_UNAVAILABLE','伺服器的記憶體限制無法安全確認，未處理圖片。',503);
    return (int)$bytes;
}

function pngUploadEnsureMemory($needed) {
    ensure(function_exists('ini_get')&&function_exists('memory_get_usage'),'PNG_RUNTIME_UNAVAILABLE','伺服器無法檢查圖片處理所需記憶體，未處理圖片。',503);
    $limit=pngUploadMemoryLimitBytes(ini_get('memory_limit'));
    $used=memory_get_usage(true);
    // Unlimited PHP memory still has the fixed byte/pixel/chunk caps below.
    // The caller budgets simultaneous strings, inflate/deflate buffers and slack.
    ensure($limit===null||($used<=$limit&&$needed<=$limit-$used),'PNG_RESOURCE_LIMIT','伺服器目前沒有足夠記憶體安全處理這張圖片；請縮小圖片後再試。',503);
}

function pngUploadChunk($type,$data) {
    return pack('N',strlen($data)).$type.$data.hash('crc32b',$type.$data,true);
}

function normalizeUploadedPng($bytes) {
    try {
        $maximumBytes=4194304;$maximumSide=2048;$maximumPixels=4194304;$maximumChunks=1024;
        ensure(is_string($bytes),'PNG_INVALID','上傳圖片必須是 PNG 二進位資料。');
        $total=strlen($bytes);
        ensure($total>=1&&$total<=$maximumBytes,'PNG_TOO_LARGE','上傳 PNG 必須介於 1 位元組與 4 MiB。',413);
        ensure(function_exists('zlib_decode')&&function_exists('gzcompress')&&function_exists('hash')&&function_exists('hash_equals'),'PNG_RUNTIME_UNAVAILABLE','伺服器缺少安全處理 PNG 所需的 zlib 或雜湊功能，未處理圖片。',503);
        ensure($total>=8&&substr($bytes,0,8)==="\x89PNG\r\n\x1a\n",'PNG_INVALID','上傳內容不是有效 PNG 圖片。');
        // Check headroom before making chunk/CRC/concatenated-IDAT copies.
        pngUploadEnsureMemory(6*$total+8388608);

        $offset=8;$chunkCount=0;$ihdr=null;$idat='';$seenIdat=false;$idatEnded=false;$seenIend=false;
        $width=0;$height=0;$channels=0;
        while($offset<$total) {
            $chunkCount++;
            ensure($chunkCount<=$maximumChunks,'PNG_INVALID','PNG 區塊數超過安全上限。');
            ensure($total-$offset>=12,'PNG_INVALID','PNG 區塊資料不完整。');
            $length=unpack('Nlength',substr($bytes,$offset,4))['length'];
            // Subtract before adding to prevent hostile uint32 length overflow.
            ensure(is_int($length)&&$length>=0&&$length<=$total-$offset-12,'PNG_INVALID','PNG 區塊長度不正確。');
            $type=substr($bytes,$offset+4,4);
            ensure(preg_match('/^[A-Za-z]{4}$/D',$type)===1&&ord($type[2])>=65&&ord($type[2])<=90,'PNG_INVALID','PNG 區塊名稱不正確。');
            $data=substr($bytes,$offset+8,$length);
            $crc=substr($bytes,$offset+8+$length,4);
            ensure(hash_equals(hash('crc32b',$type.$data,true),$crc),'PNG_INVALID','PNG 區塊校驗失敗，圖片可能已損壞。');
            $offset+=12+$length;
            ensure($chunkCount!==1||$type==='IHDR','PNG_INVALID','PNG 必須以 IHDR 區塊開始。');

            if($type==='IHDR') {
                ensure($chunkCount===1&&$ihdr===null&&$length===13,'PNG_INVALID','PNG 的 IHDR 區塊重複、位置或長度不正確。');
                $header=unpack('Nwidth/Nheight/Cdepth/Ccolor/Ccompression/Cfilter/Cinterlace',$data);
                $width=$header['width'];$height=$header['height'];
                ensure(is_int($width)&&is_int($height)&&$width>=1&&$height>=1&&$width<=$maximumSide&&$height<=$maximumSide,'PNG_TOO_LARGE','圖片寬高必須介於 1 與 2048 像素。',413);
                ensure($width*$height<=$maximumPixels,'PNG_TOO_LARGE','圖片總像素超過安全上限。',413);
                ensure($header['depth']===8&&($header['color']===2||$header['color']===6)&&$header['compression']===0&&$header['filter']===0&&$header['interlace']===0,'PNG_FORMAT_UNSUPPORTED','只接受非交錯、8 位元 RGB 或 RGBA PNG；請先由上傳介面轉換圖片。',415);
                $channels=$header['color']===6?4:3;$ihdr=$data;
                continue;
            }

            ensure($ihdr!==null,'PNG_INVALID','PNG 缺少 IHDR 區塊。');
            ensure(!in_array($type,array('acTL','fcTL','fdAT'),true),'PNG_FORMAT_UNSUPPORTED','不接受 APNG 動畫；請先轉換為單張 PNG。',415);
            // tRNS is pixel semantics, not harmless metadata. Stripping it could
            // turn transparent RGB pixels opaque; browser canvas must use RGBA.
            ensure($type!=='tRNS','PNG_FORMAT_UNSUPPORTED','透明色 PNG 必須先轉換為保留透明度的 RGBA 圖片。',415);

            if($type==='IDAT') {
                ensure(!$idatEnded,'PNG_INVALID','PNG 的 IDAT 區塊必須連續。');
                ensure($length<=$maximumBytes-strlen($idat),'PNG_TOO_LARGE','PNG 壓縮影像資料超過 4 MiB。',413);
                $seenIdat=true;$idat.=$data;
                continue;
            }
            if($seenIdat)$idatEnded=true;
            if($type==='IEND') {
                ensure($seenIdat&&$length===0&&$offset===$total,'PNG_INVALID','PNG 的 IEND 不正確、缺少影像或含有尾隨資料。');
                $seenIend=true;
                break;
            }
            // Only IHDR, IDAT and IEND are accepted critical chunks. PLTE is
            // deliberately unsupported even when optional for truecolor PNG.
            ensure((ord($type[0])&32)!==0,'PNG_FORMAT_UNSUPPORTED','PNG 含有不支援的必要區塊。',415);
            // CRC-checked ancillary metadata is not retained or decompressed.
        }
        ensure($seenIend&&$seenIdat&&$ihdr!==null&&$offset===$total,'PNG_INVALID','PNG 圖片缺少完整的影像或結尾區塊。');
        unset($data,$crc,$header,$type,$bytes);

        // zlib_decode also recognizes gzip/raw streams, so validate RFC 1950
        // explicitly: deflate CM=8, CINFO<=7, FCHECK mod 31, and no dictionary.
        ensure(strlen($idat)>=6,'PNG_INVALID','PNG 的壓縮影像資料不完整。');
        $cmf=ord($idat[0]);$flg=ord($idat[1]);
        ensure(($cmf&15)===8&&($cmf>>4)<=7&&(($cmf<<8)+$flg)%31===0&&($flg&32)===0,'PNG_FORMAT_UNSUPPORTED','PNG 必須使用不含預設字典的標準 zlib 壓縮資料。',415);
        $rowBytes=$width*$channels+1;$expectedRowBytes=$rowBytes*$height;
        // Includes multiple inflate/deflate buffers, compressed copies and 16 MiB
        // allocator slack; do not raise the server's memory_limit to bypass it.
        pngUploadEnsureMemory(6*$expectedRowBytes+6*strlen($idat)+16777216);
        $scanlines=@zlib_decode($idat,$expectedRowBytes);
        ensure(is_string($scanlines)&&strlen($scanlines)===$expectedRowBytes,'PNG_INVALID','PNG 解壓失敗或影像列資料長度不正確。');
        unset($idat);
        for($row=0;$row<$height;$row++) {
            ensure(ord($scanlines[$row*$rowBytes])<=4,'PNG_INVALID','PNG 含有無效的影像列濾鏡。');
        }
        // Keeping every validated scanline byte retains RGB/RGBA samples and
        // alpha exactly; there is no lossy decode/re-encode or GD dependency.
        $compressed=@gzcompress($scanlines,6);
        ensure(is_string($compressed),'PNG_PROCESSING_FAILED','PNG 重新壓縮失敗，未保存圖片。',500);
        unset($scanlines);
        // Signature + IHDR(25) + one IDAT framing(12) + IEND(12) = 57 bytes.
        ensure(strlen($compressed)<=$maximumBytes-57,'PNG_TOO_LARGE','正規化後的 PNG 超過 4 MiB；請縮小圖片後再試。',413);
        $canonical="\x89PNG\r\n\x1a\n".pngUploadChunk('IHDR',$ihdr).pngUploadChunk('IDAT',$compressed).pngUploadChunk('IEND','');
        ensure(strlen($canonical)<=$maximumBytes,'PNG_TOO_LARGE','正規化後的 PNG 超過 4 MiB。',413);
        return array('bytes'=>$canonical,'mime'=>'image/png','width'=>$width,'height'=>$height,'byteLength'=>strlen($canonical),'sha256'=>hash('sha256',$canonical),'normalization'=>'png-v1');
    } catch(AppError $error) {
        throw $error;
    } catch(Throwable $error) {
        // Never disclose arbitrary decoder messages, raw bytes, paths or payloads.
        throw new AppError('PNG_PROCESSING_FAILED','圖片處理未完成，未保存圖片；請確認伺服器 zlib 與記憶體設定。',500);
    }
}
