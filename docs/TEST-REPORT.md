# 第四階段：圖文與海報原生排版測試與交付範圍

日期：2026-10-21。本次第四階段在前九類功能上新增圖文（illustrated）與海報（poster）原生排版，共十一類啟用；圖片上傳／私人保存／實際分析屬已交付的前一圖片階段。圖文／海報提供完整文字、既有固定圖片、原生編輯與含圖 HTML 匯出，固定文字模型僅接收圖片中繼資料，不接收像素。互動視覺程式仍未啟用；其隔離開發檔案不列入本次凍結、發布或測試數。沒有 AI 像素生成／修改／融合或新圖片 provider。保留固定模型、主／小版號、不可變歷史、固定引用及本機安全邊界。

前一圖片階段來源基準為 `41740ef6746ebd06ca7134c057d6d7d20fa231b4`。本報告對應本次 121 份檔案的本機凍結來源，並非將該舊 commit 當成本次排版版本；遠端 commit 與下載內容須另行核對，不代表已部署。

## 已實際執行與發布清單

- **666 項 Node 測試通過，0 失敗、0 跳過。** 為本次排除互動程式隔離開發檔案後的凍結來源總數；既有回歸與新增 composition 檢查均包含其中，不另加總。發布清單為 121 份檔案，包含本次 12 份 composition 來源／測試檔案。
- **Python SQLite 實際執行 SQL：86 項檢查通過。** 原有檢查 12 項，加媒體檢查 74 項；不是 PHP PDO 整合測試。
- **14 份 public JavaScript 檔案通過 node --check。** 只代表語法檢查，不是瀏覽器 runtime。
- **58 份發布 PHP 來源納入 Pygments 詞法／括號結構檢查。** 這不是 PHP parser、php -l 或原生 PHP 執行驗收。

- Node 直接執行前端純函式、真實 PNG／JPEG 位元組 fixture 的標頭解析、production renderer／事件處理與請求 adapter；DOM、canvas／decoder 及 fetch 使用測試替身。這不是瀏覽器真正解碼／顯示、PHP HTTP server 或供應者實測。
- Python SQLite 實際執行 SQL，含原資料表檢查及從媒體儲存程式取出的 DDL；不是 PHP PDO 整合測試。
- PHP Pygments 詞法／括號結構檢查不是 PHP parser、php -l 或 runtime。
- JavaScript node --check 只檢查語法，不代表瀏覽器 API、下載或視覺驗收。
- 前一網頁階段的獨立 HTML 範例曾經 Python lxml／HTMLParser 檢查無 script、外部資源、form、iframe，頁內連結皆有目標、FAQ 與 ID／CSP 結構有效；它是當時範例的結構檢查，不是本次圖片、瀏覽器、鍵盤或 CSP 實測。

完整執行輸出以 [test-results.txt](test-results.txt) 為準。下文區分 Node／SQL／詞法檢查的涵蓋範圍與仍未執行的原生 PHP fixtures，不把來源檢查當作執行 PHP。

### Node 與來源契約涵蓋範圍

- 前端／DOM／固定腳本：執行 production renderer、事件處理及 fetch adapter。DOM 是測試替身，fetch 接收端是攔截式契約替身，不是真實瀏覽器或 PHP HTTP server。既有回歸包括固定專案模型與舊專案一次性綁定、明確確認生成、候選接續微調、文章選段完整快照、短文全文、手動段落結構修改、原文空白保存、版本樹、獨立比較與融合、來源壓縮、過期選項、草稿與未知結果保護。
- 後端來源契約：Host／Origin／CSRF、暫存 Key、owner 隔離相關來源、固定目的地、請求重放、版號、逐版目標、引用、模型綁定與來源快照。來源檢查只能證明所檢查的程式片段及計算條件存在，不等於執行 PHP。
- 模組與完整性：十二類順序，十一類啟用；圖片只提供上傳／分析，圖文／海報提供原生文字與既有圖片排版，不提供像素生成／修改；互動程式維持規劃；同次模型回覆提供 ready／exploring、原始 JSON 嚴格 schema、文章選段合併、完整生成與融合、內容容量及模型輸出預算。
- HTTP 傳輸：POST 的 JSON body.action／CSRF／Content-Type、GET 讀取、錯誤與不自動重試，最壞 JSON 跳脫及完整文章在 1 MiB envelope 內的序列化；原生陣列、多行文字、心智圖完整 artifact／節點範圍、向量完整物件／幾何／圖層，以及網頁完整區塊與三部分確認欄位。不是實際 HTTP 安裝或 PHP 接收整合測試。
- 表格／圖表：原生列欄格及穩定 ID、完整作品、原始 JSON 物件／陣列識別、CSV／TSV 可疑公式文字防護；受限流程圖語法與安全 SVG、TD／LR、節點形狀、分支／循環／自我連線、40 節點／80 連線限制、無損模式切換；長條／折線／圓餅及數值邊界。
- 心智圖純函式：完整 artifact 精確形狀、nodes／proposals 跨清單 ID 唯一、單根／連通／無循環、待選父節點必須已入圖、UTF-8／Unicode／容量與秘密字串檢查；原字串、空白、ID、父子關係及完整文字投影不截斷。
- 心智圖互動：初始待選全部不勾選，選節點或勾 checkbox 不修改作品；只有明確加入才將勾選建議移入草稿。名稱／說明套用、自填、移動、合併、空末端移除、20 步草稿復原、未套用欄位跨節點／介面重畫保存、唯讀及過期事件處理、超限原子拒絕與錯誤恢復。測試直接觸發 production 回呼，但仍不是瀏覽器實測。
- 心智圖預覽與匯出：安全 DOM／SVG 只畫已入圖節點，有完整文字清單及另列待選內容；單根、深層／寬分支樹的有限幾何；惡意標記不執行。JSON 保留完整樹與待選，TXT 明確分區，SVG 不混入待選。單件匯出只用已保存版本，不呼叫 AI。
- 心智圖模型來源契約：初次只有根及 2–12 個待選分支；指定已保存目標節點於推論前驗證。AI 修訂不得修改 nodes 或其他父節點的 proposals，待選重排／同內容不能假造修訂；澄清原件回傳後捨棄，不存假版本。融合已入圖節點必須有選定來源中的完整身份，不可把待選或新造內容升為已入圖節點。
- 心智圖固定腳本：虛構主題與待選分支、明確逐字子分支示範、無法辨識及重複要求只釐清；已入圖集合與待選狀態分離。融合只合併相容來源，拒絕不同根、ID／內容／父子／狀態衝突、只變待選的假融合及容量溢位，不推測使用者的真實主題。
- 共用心智圖整合：完整 fetch snapshot、正確 targetNodeId、來源／候選／正式版分離、目標節點變更使舊單選失效、固定引用與融合來源快照、匯出及完整歷史保護、來源手動合併意見優先與 12,000-byte 目標欄超限原子拒絕。這裡的狀態重新讀取不是重開瀏覽器或整頁重新整理後的草稿持久化。

- 向量原生資料與數值：六種 primitive、精確物件／真正陣列、穩定唯一 ID、有限原生 number／integer、整數畫布、上下限、最多三位小數、正寬高／負線段位移、局部頂點及類型對應欄位。共用原始模型／作品 schema 的數值型別與 minimum／maximum 來源契約亦納入，不將數字字串或布林值視為數值。
- 向量完整投影：固定欄位順序、三位小數精確序列化、負零正規化及 U+2028／U+2029 跳脫；UTF-8／秘密字串檢查、60,000-byte 精確邊界與超出一 byte 的原子拒絕，不截斷。伺服器的 jsonEncode 最終 byte guard 另有來源檢查，非預設 PHP serialize_precision 的真實執行仍屬未執行 fixture。
- 向量編輯器與 SVG：選取本身不改作品；原始欄位須明確套用、跨物件／busy／唯讀重畫保留，過期回呼不能改新狀態；未套用內容阻擋會丟字的操作。新增／同位置複製／刪除／重排、20 步復原、容量錯誤恢復、完整文字與安全 SVG／JSON／TXT 匯出皆有執行測試，沒有任意 SVG 解析、外部資源、path、圖片或程式執行路徑。
- 向量固定腳本：虛構五物件圖案、逐字標題或唯一名稱／ID 色彩設定，文件標題與文字物件分離；線段填色不冒充可見改變，重複或只改等值色碼大小寫不造假版本。融合檢查相同畫布／背景、同 ID 完整相容、圖層順序與重複物件數量、100 物件與總容量，不猜測衝突或丟棄來源。
- 共用向量整合：實際執行 production renderer／事件回呼／fetch adapter，但接收端是攔截式替身。完整 snapshot 傳送原生 artifact，不把預覽或摘要當作品；AI 風格固定腳本微調、同頁讀取最新狀態與釐清後保留未套用草稿、完整歷史、各版目標、明確比較／融合、固定引用、採用、定稿、匯出及有效單選上下文都有回歸檢查。這不是 PHP HTTP server、真實模型或整頁重新整理後的草稿持久化。
- 向量 PHP 模組來源契約：生成一份完整候選，修訂先驗來源與本版目標，釐清原樣回傳後捨棄；融合只用明確選定版本與各自目標，繪製指紋拒絕照抄及僅改標題／ID／名稱／等值色碼大小寫的假融合。指紋保留順序與重複數量；這些 PHP 檢查仍只讀來源，不執行 PHP 或判斷模型視覺品質。

### 保留的網頁涵蓋範圍

- 原生資料：精確 root／section／entry 欄位、真正 boolean 導覽、完整密集陣列、穩定且範圍唯一的 ID、三種主題及五種區塊；cards／faq 各 1–12 條目、全頁 1–20 區塊。UTF-8、不可空標題、秘密字串、原空白與換行保留、固定序列化順序及 60,000-byte 正規 JSON 精確邊界與超出拒收。
- 頁內操作：hero／cta 按鈕文字及目標成對、cta 必須有按鈕、目標只准本頁有效區塊；其他區塊不能帶 action。多個預覽使用獨立 DOM ID；FAQ 以 details／summary 呈現，惡意標記與 URL-looking 文字不轉成可執行元素或外部連結。
- 完整編輯：設定與區塊欄位明確套用／放棄、卡片／問答新增刪除及重排、區塊結構操作保護、仍被引用目標不可直接移除、20 步草稿復原。作者文字使用可保留換行的 textarea；未套用欄位跨區塊／busy／同頁重畫保留，切換來源後過期編輯事件不能修改新來源或別的項目；超限原子拒收而不截短，不把頁面草稿當持久版本。
- 匯出來源與模板：HTML 固定響應式 CSS、完整文字跳脫、charset 後的早期 CSP、無 JS／外部資源／表單、原生頁內連結與 FAQ；JSON／TXT 完整保存原生資料。這些是產生內容及 fake DOM／來源契約檢查，不是實際瀏覽器 CSP、下載、版面或安全認證；沒有驗證或實作檔案匯入 UI。
- 固定腳本：虛構街角故事日的五種區塊，精確字面標題／單區塊標題與內文／固定主題／導覽修改，不解析真實需求。無變動只釐清；融合保留相容完整區塊、順序及重複內容，拒絕同 ID 衝突、主題／導覽衝突及容量溢位，不擅自改名、捨棄或補造來源。
- 共用整合：三個獨立方向勾選與最新 summaryRevision 綁定，勾選無 fetch／模型／版本寫入，全部確認後才明確傳送 confirm_generate；新方向失效重設、舊事件與錯誤 revision 拒收。執行 production renderer／回呼／fetch adapter，但接收端為攔截式替身，不是 PHP HTTP server。
- 完整歷史與來源：候選／正式版反覆修訂、手動完整主／小版、逐版目標、獨立比較／融合、同專案固定引用、採用與定稿、固定模型來源及 JSON／HTML／TXT 匯出。原作品與正式版不被隱含覆寫，AI 只讀已保存來源，頁面草稿不隨同送出。
- PHP 模組來源契約：三部分 brief 對應、完整生成／修訂／釐清／融合、原始 JSON schema、引用固定快照、完整來源與本版目標優先、ID-only 假修訂／假融合防護。來源檢查不執行 PHP，也不保證模型設計品質或語意遵循率。

### 保留的圖片涵蓋範圍

- 本機位元組預檢：真實靜態 PNG、基線／漸進 JPEG fixture 的標記、完整區塊／掃描長度、CRC、尺寸與總像素邊界，假 MIME／檔名不影響格式判定；動畫控制、截斷、尾隨資料、非法 PNG／JPEG 欄位及不支援格式拒收。這裡實際執行的是 JavaScript parser，不是 PHP PNG 正規化或瀏覽器影像解碼。
- 瀏覽器正規化契約：原始檔 12 MiB、各邊 8192、16,777,216 pixels，EXIF-oriented 解碼尺寸、0／90／180／270 度旋轉、比例縮到 2048、不放大、alpha canvas、輸出 4 MiB PNG；輸入讀取／解碼／畫布／匯出失敗、資源清理及 URL revoke。decoder／canvas 是替身，不能據此宣稱真正 JPEG 方向、PNG 透明度、顏色或解碼品質已看過。
- 原生圖片 metadata：精確 root／asset 欄位、真正型別、title／alt／attribution 的 UTF-8 與秘密字串限制、穩定 ID、SHA-256、尺寸、mime、png-v1、完整投影與安全文字。資料形狀驗證不等於存取權或證明資產存在。
- 圖片編輯器與預覽：未套用欄位、套用／放棄、same-asset metadata 另存、安全文字、唯讀及過期回呼保護；私人 loader 的 Blob 形狀、大小、非公開 object URL、延遲回應／錯誤／dispose 清理。只有頂端正式版自動讀圖，其餘版本／引用／比較須明確載入，不因整頁重畫就自動讀全部歷史圖片；過期或重複載入事件不得另發讀取。fake DOM 不能證明真實瀏覽器的呈現、CSP 執行、下載或鍵盤操作。
- production 工作區與傳輸：無 Key 本機準備、原檔名不送出、明確保存主／小版、連按防重、草稿保留、取消與切換保護；同源 POST／CSRF／credentials、multipart 固定檔名及 read_image 精確 project／item／version。fetch 是攔截式替身，不是 PHP 接收端；未知保存結果先查狀態再重試同一 payload／Blob，明確 stale revision 拒收保留副本與文字。
- 分析確認與能力邊界：圖片專案一次 opt-in 不呼叫 AI；之後普通送出無額外確認視窗且沿固定模型。無圖片生成／融合、無假預設 asset、無 source-free metadata snapshot，分析不產生像素修訂。固定腳本不提供圖片上傳、私人讀取或真正圖片分析；非圖片模組的圖片引用不冒稱已傳送像素。
- PHP PNG 來源契約：有界區塊／CRC、RGB／RGBA 8-bit 非交錯限定、拒絕 APNG／tRNS／PLTE、標準 zlib、精確掃描列、filter、重新壓縮、只保留 IHDR／IDAT／IEND、最終 SHA-256，以及保守記憶體 headroom。這些來源斷言不執行 PHP zlib，也不證明 runtime 記憶體行為。
- PHP 儲存／路由來源契約：同一既有 PDO、僅增建兩表、BLOB 與 append-only receipt、BEGIN IMMEDIATE 內資產＋版本＋收據原子保存、requestId／fingerprint、owner／project／item／version 授權、同資產 metadata snapshot、封存／定稿／固定引用保留、no GC。媒體端點 POST／Origin／CSRF、1 MiB 主 JSON 不變、multipart／read body 上限及回應安全標頭仍是來源檢查，不是 HTTP 實測。
- 真實像素模型來源契約：最多 5 個不同資產、合計 12 MiB raw PNG、hash／descriptor 核對、原始位元組只在記憶體轉 OpenAI input_image 或 Ollama images；編碼前 headroom 不修改 memory_limit。圖片討論傳來源＋固定圖片引用，比較只傳所選版本；provenance 保存 item／version／asset／hash，請求後清空避免圖像沿用。原生 provider fixture 未執行，沒有呼叫真實視覺模型。
- 匯出／備份：專案 JSON 有圖片 metadata-only 警語，不混入 PNG/base64；個別下載與私人預覽使用已保存確切版本，不取代原始檔備份。這些測試不驗證完整離線備份還原、Session 恢復或外部圖片工具相容性。

### 本次圖文／海報新增涵蓋範圍

- 原生資料：illustrated／poster 精確欄位、真正型別／密集陣列、固定主題、區塊型別、圖文排列／對齊及海報畫幅；圖文 1–24、海報 2–16 區塊及必要標題／內容結構。穩定唯一 ID、32 位小寫引用 ID、原文／空白／換行、UTF-8／秘密字串及 60,000-byte 正規 JSON 邊界。完整 artifact 為權威，投影不是摘要。
- 編輯與 production 工作區：設定／區塊明確套用及放棄，新增／移除／上下重排，未套用欄位跨區塊／同頁重畫保留及結構操作阻擋，完整主／小版另存；過期回呼、忙碌／唯讀狀態與來源切換保護。同一固定引用 ID 快照衝突時阻擋編輯器及保存，不任選來源；沒有宣稱未實作的復原堆疊或持久草稿。
- 海報確認：02 的 style／text／layout 三部分及最新 summaryRevision，單純勾選無推論／版本寫入，全部明確確認後才生成，方向變動重設。PHP 路由來源檢查另外核對缺項／重複／錯序／過期拒收與確認快照；不是執行 PHP HTTP。
- 私人預覽：只按已保存版本自己的 referencesSnapshot，正式版自動讀圖，候選／歷史／比較與草稿明確載入。DOM 文字安全、圖片預覽生命週期及 stale 回呼不作用於新來源；night 的正文、圖說與圖片 metadata 有專用明亮樣式。這是 renderer／CSS 契約檢查，不是瀏覽器目視或整頁無障礙驗收。
- 完整 HTML：呼叫既有私人 loader 讀確切 pinned item／version，驗證 Blob MIME、長度、PNG 標頭／尺寸、SHA-256；同圖讀取可去重但內嵌容量按每次出現累加，raw PNG 合計 20 MiB、每張 4 MiB。缺漏／重複／衝突引用、不同 snapshot.id、錯 PNG／hash、未支援 crypto、讀取失敗及每個 await 期間失效均拒絕，不下載部分缺圖結果，也不取目前新引用替代。
- HTML 安全與其他匯出：固定 CSS、早期 CSP、全部作者文字跳脫、僅經驗證的 PNG data URL，無 JS／外部資源／表單；合法純文字排版可匯出，不捏造圖片。JSON `{notice,artifact}` 僅可編輯排版與引用 ID，TXT 僅文字，不含圖片或來源完整版本；有備份警語。crypto／Blob 與非同步流程在 Node 測試中執行，fetch／DOM 仍為替身，並非瀏覽器下載或 CSP runtime。
- 後端來源契約：同專案／owner 的確切項目／保存版本與 image artifact 核對、私人資產解析、推論前拒絕缺漏／變造／跨範圍來源；目前引用加已使用歷史 pin 的不可變版本快照，以及比較來源引用聯集。僅具 metadata 或合法 ID 不當作授權，同 ID 衝突 fail closed，不默默改用最新圖。這些 Node 檢查閱讀 PHP 來源，不執行 PHP／PDO。
- 模型來源契約：固定文字模型、單一完整候選、metadata allowlist 與 pixelsProvided=false，不傳 raw／base64／URL／附件。完整已保存來源修訂、各版目標比較、明確融合、釐清原件驗證後捨棄，ID-only／同圖別名假修訂及照抄來源假融合防護；新版本不自動採用。明顯看圖假宣稱有有界字樣拒收，但不是語意真實性保證，沒有真實 API 遵循率證據。
- 發布邊界：composition 正式頁啟用，離線固定腳本明確不支援，不以假素材冒充實作。interactive 隔離檔案不列入 121 檔凍結清單、58 PHP、14 JS 或 666 Node，仍未啟用；既有來源與 86 SQLite 回歸保留。

### 其他檢查的邊界

Python SQLite 檢查實際執行 SQL：建表、寫入與 owner 隔離、讀取、請求唯一性、非破壞初始化、成員設定遷移及 compare-and-swap。不是 PHP PDO 整合測試。媒體 SQL 檢查另直接執行媒體 DDL、BLOB／descriptor 約束、owner／item 範圍、收據唯一性、非破壞初始化、配額查詢與交易回滾等合成資料案例；不能把 Python sqlite3 成功等同 PHP PDO／HTTP 上傳整合通過。

先前另用 Inkscape 將原生心智圖 SVG（5 個已入圖節點、兩個主要分支）轉為 PNG，並實際目視檢查節點與連線。這只驗證該 SVG 範例，不是網頁、響應式版面、瀏覽器下載或互動驗收。前次流程圖 TD／LR SVG 的 PNG 檢視同樣只限當時範例。前次向量里程碑已用已安裝的 Inkscape 將 640×420 晨光書屋 SVG 轉成 PNG，並實際目視檢查五個原生物件（1 個 ellipse、2 個 polygon、1 個 line、1 個 text）的繪製與文字。這只驗證該範例能被 Inkscape 渲染，不是瀏覽器或外部編輯器匯入操作驗收，也未驗證「形坊」相容性。文字／背景色數值對比與 CSS／DOM 契約不是整頁無障礙認證。

## 已準備但未執行

環境沒有 PHP runtime。`tests/run.php`、`revision.php`、`versioning.php`、`members.php`、`response-contract.php`、`choices.php`、`phase1.php`、`artifacts.php`、`mindmap.php`、`vector.php`、`webpage.php`、`image-artifact.php`、`png-upload.php`、`media-store.php`、`image-vision.php`、`image-actions.php`、`composition.php`、`composition-model.php` 與 `composition-app.php` 都是待在 PHP 7.4+ 執行的原生 fixtures，不列入通過數。它們使用 in-memory Store／假模型或注入式 transport，不使用真實 Key、不呼叫外部服務。

`mindmap.php` 準備檢查真正 PHP helper／module 的拓樸、精確投影、原始 JSON 型別、60,000-byte 邊界與拒絕截斷、初次根與待選限制、選定已入圖節點、其他父節點待選保護、僅本版目標修訂、澄清不存版、融合來源身份及模型呼叫次數。這些是測試程式，不是已執行證據。

`vector.php` 準備檢查真正 PHP helper／module 的六種原生物件、數值型別／幾何／三位小數、原始 JSON schema 整數與上下限、UTF-8／秘密字串、60,000-byte 精確投影邊界及不同 serialize_precision、完整生成／修訂／釐清／融合、本版目標優先及模型呼叫次數。fixture 使用模型替身，未執行，不列入任何通過數。

`webpage.php` 準備檢查真正 PHP helper／module 的五種區塊、三種主題、嚴格欄位／boolean／頁內目標、正規 JSON 與 60,000-byte 邊界、完整生成／修訂／釐清／融合、固定來源與各版目標、三部分方向確認及模型呼叫次數。這些 fixture 未執行，不列入通過數，也沒有真實模型或瀏覽器連線。

圖片相關原生 fixtures 準備檢查真正 PHP metadata helper／PNG zlib 正規化、記憶體限制、同一 PDO 的 BLOB／版本／收據交易、授權讀取、固定引用、同資產 snapshot、原始位元組 provider payload 及分析流程。它們不是本次已執行證據，使用 fixture／注入 transport，不使用真實 Key 或真實 AI。

`composition.php`、`composition-model.php` 與 `composition-app.php` 準備檢查真正 PHP 原生結構／型別／容量、固定 metadata-only 模型契約、海報三部分確認、完整主／小版／比較／融合、目前與歷史引用、owner／同專案／確切資產預檢、拒收時不呼叫模型、同 ID 衝突及舊正式版不變。這三份原生 fixture 未執行，不列入 666 項 Node 或 86 項 SQLite 通過數，不把來源檢查當作 PHP 執行證據。

原有 fixtures 另涵蓋綁定與設定變更、ready／confirm 一次呼叫與重放、失敗原子性、候選小版來源、融合完整直接快照、短文全文、文章精確選段／空白／其餘段落保持、近全文容量、跨項目防混用，以及表格／流程圖／統計資料與安全語法。

## 尚未驗證與未提供

- 未執行 PHP／PDO／Apache／XAMPP 的完整 HTTP 安裝、升級或實際操作驗收。既有資料保護依來源及 SQLite 檢查，仍需先備份再本機驗收，不宣稱所有升級環境已通過。
- 未完成 Chromium 或其他真實瀏覽器的桌面／行動視覺驗收。fake DOM 事件與 renderer、SVG 輸出或 CSS 契約不代表實機畫面、下載、鍵盤／觸控互動已看過。
- 未讀取、生成、設定或傳送真實 API Key，未呼叫真實 OpenAI／Ollama，沒有測試模型品質、延遲、費用、結構化輸出遵循率或硬體容量。模型清單可見不等於生成成功。
- 已實作十一類，新增圖文／海報原生排版，保留文字、表格、流程圖／統計圖、心智圖、向量、網頁及圖片上傳／分析。圖片尚無 AI 像素生成／修訂／融合；互動程式僅有規劃位置。「共聊」不在本次開發中。
- 網頁沒有任意 HTML／CSS／JS、外部圖片／字型／連結、表單、登入、付款、API、部署或檔案匯入 UI。HTML 匯出為固定無腳本靜態檔，JSON 保留可編輯資料，不宣稱 roundtrip 匯入已完成；網頁功能本身未放寬主頁 CSP 或新增 iframe 執行端點；本階段圖片功能只新增 img-src blob: 供私人預覽。
- 沒有公開部署、多人登入、公共 API 資助、KML 整合或心智圖外部雙向同步。沒有設定 GitHub Actions，原始碼推送不等於 CI 通過；亦未驗證圖坊、使用者所稱「形坊」或其他外部工具的匯入相容性，沒有向量 SVG 匯入、path／貝茲曲線或圖片嵌入。

## 本機人工驗收與安全覆蓋

先使用[固定腳本示範](../public/demo.html)，再依[安裝與驗收](INSTALLATION.md)在自己的 PHP 主機檢查，心智圖、向量圖形、網頁、圖片、圖文與海報具體步驟見[使用指南](USER-GUIDE.md)。實際按 AI 操作可能產生費用，示範與測試替身不代表模型結果。未知結果先讀取現況，不反覆重送；明確格式拒收保留舊資料，但上游仍可能已計費。

同系列更新只合併覆蓋程式，保留 `config.local.php`、原私有資料庫、私有資料及 Cookie／Session，在停止寫入時離線備份整個私有資料夾及設定後再操作，保留仍有效暫存 Key，不重裝、不重設資料庫。媒體只在原 SQLite 增建兩表，圖片 JSON 不含 PNG，不是完整備份。前端快取標籤為 `20261021-version14`；需要時強制重新整理，不清除 Cookie。舊規劃心智圖、向量圖形、網頁、圖片、圖文與海報可使用對應新能力，但不把舊文字或不存在的歷史補造成原生作品。
