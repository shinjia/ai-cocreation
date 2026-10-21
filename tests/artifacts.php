<?php
/**
 * Native PHP 7.4+ artifact/parser/module fixtures. Run: php tests/artifacts.php
 * UNEXECUTED in the authoring environment: PHP is unavailable. Node source
 * contracts and a lexer pass are NOT PHP syntax, runtime, HTTP or provider QA.
 * Uses the real validators/modules and a deterministic provider seam, no key,
 * network, SQLite, external service, paid inference or mutable user data.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
$artifactChecks=0;
function artifactCheck($ok,$label) {global $artifactChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$artifactChecks++;echo 'PASS '.$label."\n";}
function artifactReject($fn,$label,$code='ARTIFACT_INVALID',$status=400) {
    $error=null;try{$fn();}catch(AppError $e){$error=$e;}
    artifactCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);
}
function artifactFixture($type) {
    if($type==='flowchart')return array('kind'=>'chart','chartType'=>'flowchart','title'=>'已提供的校對流程','xLabel'=>'','yLabel'=>'','sourceText'=>"flowchart TD\nStart(\"開始\")\nReview{\"是否通過\"}\nDone[\"完成\"]\nStart --> Review\nReview -->|是| Done\nReview -->|否| Start");
    if($type==='table')return array('kind'=>'table','caption'=>'工作安排','columns'=>array(array('id'=>'task','label'=>'任務'),array('id'=>'owner','label'=>'負責人')),
        'rows'=>array(array('id'=>'row_a','cells'=>array('校對','A')),array('id'=>'row_b','cells'=>array('排版','B'))));
    return array('kind'=>'chart','chartType'=>'bar','title'=>'既有資料','xLabel'=>'月份','yLabel'=>'筆數','sourceText'=>"月份\t甲組\t乙組\n一月\t2\t4\n二月\t3\t5");
}
function artifactFixtureBrief($type) {return array('purpose'=>'整理資料','audience'=>'參與者','message'=>'清楚呈現已提供資料','tone'=>'清楚','constraints'=>'不捏造數據','summary'=>'整理使用者提供的資料並保留原意。','items'=>array(array('id'=>'document','label'=>$type==='table'?'表格內容':'圖表來源')));}
function artifactFixtureVersion($type,$suffix='a') {
    $artifact=artifactFixture($type);
    return array('id'=>str_repeat($suffix,32),'number'=>1,'major'=>1,'minor'=>0,'title'=>'來源 '.$suffix,'artifact'=>$artifact,'items'=>artifactItems($artifact),'contentType'=>$type,
        'rationale'=>'來源說明','source'=>'manual','basedOnVersionId'=>null,'goalText'=>'此來源自己的目標。','changeSummary'=>'來源摘要','goalSnapshot'=>artifactFixtureBrief($type),
        'discussionMessageIds'=>array(),'provenance'=>array('model'=>'fixed-fixture-v1'),'createdAt'=>'2026-01-01T00:00:00+00:00');
}
function artifactFixtureProject($type) {
    return array('title'=>'原生作品測試','description'=>'不使用外部服務','module'=>$type,'activeItem'=>array('title'=>'資料作品','description'=>'測試完整快照'),
        'references'=>array(),'messages'=>array(),'brief'=>artifactFixtureBrief($type),'goalApprovedAt'=>'2026-01-01T00:00:00+00:00','officialVersionId'=>null,'versions'=>array(artifactFixtureVersion($type)));
}

// Native data shape, UTF8/byte bounds, stable identities and inert text.
artifactCheck(artifactType('table')&&artifactType('chart')&&!artifactType('article')&&!artifactType(null),'exact artifact type registry');
$table=artifactFixture('table');$table['caption']=" \n保留說明\t ";$table['columns'][0]['label']=' 任務 ';
$table['rows'][0]['cells']=array(" \t=SUM(A1:A2)\n<script>alert(1)</script> ",'');
artifactCheck(validateArtifact($table,'table')===$table,'table preserves caption, labels, empty cells, formula-looking and HTML-looking text exactly');
artifactCheck(artifactItems($table)[0]['id']==='document'&&artifactItems($table)[0]['label']==='表格內容','stable legacy projection definition');
artifactCheck(strpos(artifactItems($table)[0]['content'],'"'.str_replace('"','""',$table['rows'][0]['cells'][0]).'"')!==false,'TSV projection quotes embedded tab/newline without executing content');
$plain=artifactFixture('table');$plain['rows'][0]['cells'][0]='a"b';
artifactCheck(strpos(artifactItems($plain)[0]['content'],'"a""b"')!==false,'TSV projection doubles literal quotes');
foreach(array('extra'=>function($v){$v['extra']=true;return $v;},'missing'=>function($v){unset($v['caption']);return $v;},'wrong kind'=>function($v){$v['kind']='chart';return $v;},
    'column extra'=>function($v){$v['columns'][0]['content']='x';return $v;},'row extra'=>function($v){$v['rows'][0]['html']='x';return $v;},
    'duplicate column id'=>function($v){$v['columns'][1]['id']=$v['columns'][0]['id'];return $v;},'duplicate row id'=>function($v){$v['rows'][1]['id']=$v['rows'][0]['id'];return $v;},
    'bad id'=>function($v){$v['rows'][0]['id']='_bad';return $v;},'id too long'=>function($v){$v['rows'][0]['id']=str_repeat('a',65);return $v;},
    'ragged cells'=>function($v){array_pop($v['rows'][0]['cells']);return $v;},'numeric cell'=>function($v){$v['rows'][0]['cells'][0]=3;return $v;},
    'cell null'=>function($v){$v['rows'][0]['cells'][0]=null;return $v;},'cell NUL'=>function($v){$v['rows'][0]['cells'][0]="a\0b";return $v;},
    'invalid UTF8'=>function($v){$v['rows'][0]['cells'][0]="\xff";return $v;},'cell bytes'=>function($v){$v['rows'][0]['cells'][0]=str_repeat('x',2001);return $v;},
    'caption bytes'=>function($v){$v['caption']=str_repeat('x',601);return $v;},'label bytes'=>function($v){$v['columns'][0]['label']=str_repeat('x',121);return $v;},
    'blank label'=>function($v){$v['columns'][0]['label']="\t \n";return $v;},'Unicode blank label'=>function($v){$v['columns'][0]['label']="\u{3000}\u{00a0}";return $v;},
    'no columns'=>function($v){$v['columns']=array();return $v;},'no rows'=>function($v){$v['rows']=array();return $v;},
    'nonlist columns'=>function($v){$v['columns']=array(1=>$v['columns'][0],2=>$v['columns'][1]);return $v;},
    'nonlist cells'=>function($v){$v['rows'][0]['cells']=array('a'=>'x','b'=>'y');return $v;}) as $label=>$mutate){
    $bad=$mutate(artifactFixture('table'));artifactReject(function()use($bad){validateArtifact($bad,'table');},'reject table '.$label);
}
$maximum=array('kind'=>'table','caption'=>'','columns'=>array(),'rows'=>array());for($i=0;$i<12;$i++)$maximum['columns'][]=array('id'=>'c'.$i,'label'=>'同名欄位');
for($i=0;$i<100;$i++)$maximum['rows'][]=array('id'=>'r'.$i,'cells'=>array_fill(0,12,''));
artifactCheck(validateArtifact($maximum,'table')===$maximum,'accept 12 columns, 100 rows and duplicate labels with unique stable IDs');
$bad=$maximum;$bad['columns'][]=array('id'=>'c13','label'=>'超限');artifactReject(function()use($bad){validateArtifact($bad,'table');},'reject 13 columns');
$bad=$maximum;$bad['rows'][]=array('id'=>'r100','cells'=>array_fill(0,12,''));artifactReject(function()use($bad){validateArtifact($bad,'table');},'reject 101 rows');
$maximum['columns']=array(array('id'=>'c','label'=>str_repeat('中',40)));$maximum['caption']=str_repeat('中',200);$maximum['rows']=array(array('id'=>str_repeat('a',64),'cells'=>array(str_repeat('x',2000))));
artifactCheck(validateArtifact($maximum,'table')===$maximum,'accept exact per-field UTF8 byte limits');
$size=array('kind'=>'table','caption'=>'','columns'=>array(array('id'=>'c','label'=>'c')),'rows'=>array());
for($i=0;$i<30;$i++)$size['rows'][]=array('id'=>'r'.$i,'cells'=>array(str_repeat('x',1900)));
$remaining=60000-strlen(jsonEncode($size));foreach($size['rows'] as &$row){$add=min($remaining,2000-strlen($row['cells'][0]));$row['cells'][0].=str_repeat('x',$add);$remaining-=$add;}unset($row);
artifactCheck($remaining===0&&strlen(jsonEncode(validateArtifact($size,'table')))===60000,'accept exact complete artifact 60000-byte boundary');
$size['caption']='x';artifactReject(function()use($size){validateArtifact($size,'table');},'reject complete artifact 60001 bytes without truncation');
$secret=artifactFixture('table');$secret['rows'][0]['cells'][0]='sk-'.str_repeat('x',20);
artifactReject(function()use($secret){validateArtifact($secret,'table');},'artifact cell retains existing secret guard','SECRET_IN_TEXT');
$secret=artifactFixture('table');$secret['columns'][0]['id']='sk-'.str_repeat('x',20);
artifactReject(function()use($secret){validateArtifact($secret,'table');},'stable IDs retain existing secret guard','SECRET_IN_TEXT');

// Chart TSV parsing is native, exact and bounded, never fabricated media.
$chart=artifactFixture('chart');$chart['sourceText']=" 月份 \t 甲組 \t乙組\r\n 一月 \t+2\t.5\r\n二月\t-3.5\t0004\r\n";
$canonical=validateArtifact($chart,'chart');$parsed=parseChartSource($canonical['sourceText'],'bar');
artifactCheck($canonical['sourceText']===str_replace("\r\n","\n",$chart['sourceText']),'CRLF canonicalizes to LF, terminal LF and source formatting preserved');
artifactCheck($parsed===array('labels'=>array('一月','二月'),'series'=>array(array('id'=>'series_1','label'=>'甲組','values'=>array(2.0,-3.5)),array('id'=>'series_2','label'=>'乙組','values'=>array(0.5,4.0))),'categoryLabel'=>'月份'),'parsed labels, deterministic series IDs and true numeric values');
artifactCheck(parseChartSource("\u{3000}分類\u{00a0}\t\u{FEFF}數列\n\u{2003}甲\u{3000}\t1",'bar')['labels']===array('甲'),'Unicode whitespace matches JavaScript trim');
artifactCheck(artifactItems($canonical)[0]['content']===$canonical['title']."\n圖表類型：bar\n橫軸：月份\n縱軸：筆數\n".$canonical['sourceText'],'chart legacy projection includes type, title, axes and complete source');
foreach(array(''=>"",'header only'=>"分類\t數列",'lone CR'=>"分類\t數列\r甲\t1",'extra terminal blank'=>"分類\t數列\n甲\t1\n\n",'blank header'=>"\t數列\n甲\t1",'blank series'=>"分類\t \n甲\t1",'duplicate series'=>"分類\t數列\t 數列 \n甲\t1\t2",'duplicate category'=>"分類\t數列\n甲\t1\n 甲 \t2",'blank category'=>"分類\t數列\n \t1",'ragged'=>"分類\t數列\n甲\t1\t2",'no series'=>"分類\n甲",'header bytes'=>str_repeat('x',121)."\t數列\n甲\t1",'category bytes'=>"分類\t數列\n".str_repeat('x',121)."\t1") as $label=>$source){artifactReject(function()use($source){parseChartSource($source,'bar');},'reject chart '.$label);}
foreach(array('1e2','0x10','NaN','Infinity','',' 1','1 ','1.','1,000','=2','--1','1_0','1000000000001','1000000000000.000001','-1000000000000.000001') as $number){artifactReject(function()use($number){parseChartSource("分類\t數列\n甲\t".$number,'line');},'reject invalid/beyond-bound decimal '.json_encode($number));}
foreach(array('+1000000000000.000','-1000000000000','0001000000000000.0','+.5','-.5','-0','+0','0001.50') as $number){artifactCheck(count(parseChartSource("分類\t數列\n甲\t".$number,'line')['series'][0]['values'])===1,'accept strict decimal '.$number);}
$rows=array("分類\t一\t二\t三\t四\t五");for($i=0;$i<24;$i++)$rows[]='列'.$i."\t1\t2\t3\t4\t5";
artifactCheck(count(parseChartSource(implode("\n",$rows),'line')['labels'])===24,'accept 24 categories and five series');
$rows[]="列24\t1\t2\t3\t4\t5";artifactReject(function()use($rows){parseChartSource(implode("\n",$rows),'line');},'reject 25 categories');
artifactReject(function(){parseChartSource("分類\t一\t二\t三\t四\t五\t六\n甲\t1\t2\t3\t4\t5\t6",'bar');},'reject six series');
artifactReject(function(){parseChartSource("分類\t數列\n甲\t".str_repeat('0',12000),'bar');},'reject source over 12000 bytes');
artifactCheck(parseChartSource("分類\t數列\n甲\t-0\n乙\t2",'pie')['series'][0]['values'][1]===2.0,'pie permits signed zero and positive total');
artifactReject(function(){parseChartSource("分類\t數列\n甲\t0",'pie');},'pie rejects zero total');
artifactReject(function(){parseChartSource("分類\t數列\n甲\t-1\n乙\t2",'pie');},'pie rejects negatives');
artifactReject(function(){parseChartSource("分類\t數列\n甲\t-0.".str_repeat('0',400)."1\n乙\t2",'pie');},'pie rejects tiny negative even if binary float underflows');
artifactReject(function(){parseChartSource("分類\t一\t二\n甲\t1\t2",'pie');},'pie rejects multiple series');
artifactReject(function(){parseChartSource("分類\t數列\n甲\t1",'scatter');},'reject unsupported chart type');
foreach(array('extra'=>function($v){$v['svg']='<svg/>';return $v;},'title bytes'=>function($v){$v['title']=str_repeat('x',601);return $v;},'axis bytes'=>function($v){$v['xLabel']=str_repeat('x',121);return $v;},'wrong kind'=>function($v){$v['kind']='table';return $v;}) as $label=>$mutate){$bad=$mutate(artifactFixture('chart'));artifactReject(function()use($bad){validateArtifact($bad,'chart');},'reject chart '.$label);}

// Restricted flowchart source, preserved labels, exact declarations and safe edges.
$flow=artifactFixture('flowchart');$graph=parseFlowchartSource($flow['sourceText']);
artifactCheck($graph['direction']==='TD'&&array_column($graph['nodes'],'shape')===array('round','diamond','rect')&&count($graph['edges'])===3,'flowchart parses independent shaped nodes and labeled cyclic edges');
artifactCheck(validateArtifact($flow,'chart')===$flow&&parseChartSource($flow['sourceText'],'flowchart')===$graph,'native chart accepts flowchart and shared parser dispatches');
$forward="\n%% ordinary comment\n graph TB;\nA -->|\"是\"| B;\nB[\"  保留空白  \"];\nA{判斷};\nB --> B;\n";
$parsed=parseFlowchartSource($forward);
artifactCheck($parsed['direction']==='TD'&&$parsed['nodes'][0]['label']==='  保留空白  '&&$parsed['edges'][0]===array('from'=>'A','to'=>'B','label'=>'是'),'flowchart forward references, comments, single terminal semicolon and literal labels');
artifactCheck($parsed['edges'][1]===array('from'=>'B','to'=>'B','label'=>''),'flowchart permits self loop without implicit nodes');
artifactCheck(parseFlowchartSource("flowchart LR\nA[\"文字;\"]\nB(\"結束\")\nA-->||B")['nodes'][0]['label']==='文字;','flowchart inner semicolon preserved and empty explicit edge label supported');
$crlf=$flow;$crlf['sourceText']=str_replace("\n","\r\n",$flow['sourceText']);artifactCheck(validateArtifact($crlf,'chart')['sourceText']===$flow['sourceText'],'flowchart canonicalizes CRLF only');
foreach(array('missing header'=>"A[開始]",'unsupported direction'=>"flowchart RL\nA[開始]",'missing node'=>"flowchart TD",'only comments'=>"%% comment",'empty node label'=>"flowchart TD\nA[]",'unicode blank node'=>"flowchart TD\nA[\u{3000}]",'duplicate node'=>"flowchart TD\nA[一]\nA[二]",'undefined endpoint'=>"flowchart TD\nA[一]\nA --> B",'duplicate edge'=>"flowchart TD\nA[一]\nA --> A\nA --> A",'mismatched bracket'=>"flowchart TD\nA[一}",'hyphenated id'=>"flowchart TD\nA-B[一]",'numeric first id'=>"flowchart TD\n1A[一]",'long id'=>"flowchart TD\n".str_repeat('a',41).'[一]',
    'init directive'=>"%%{init: {}}%%\nflowchart TD\nA[一]",'directive inside comment'=>"flowchart TD\n%% comment %%{bad}\nA[一]",'inline node on edge'=>"flowchart TD\nA[一] --> B[二]",'edge chain'=>"flowchart TD\nA[一]\nB[二]\nC[三]\nA --> B --> C",'subgraph'=>"flowchart TD\nsubgraph Group",'click'=>"flowchart TD\nA[一]\nclick A callback",'style'=>"flowchart TD\nA[一]\nstyle A fill:red",'class'=>"flowchart TD\nA[一]\nclass A red",'image'=>"flowchart TD\nA@{img: test}",'multiple semicolons'=>"flowchart TD;;\nA[一]",'node extra semicolon'=>"flowchart TD\nA[一];;",'two declarations per line'=>"flowchart TD\nA[一]; B[二]",'edge pipe content'=>"flowchart TD\nA[一]\nA -->|一|二| A",'unquoted source injection'=>"flowchart TD\nA[foo]; click A call evil(); X[bar]",'nested rect shape'=>"flowchart TD\nA[[foo]]",'nested round shape'=>"flowchart TD\nA((foo))",'unquoted delimiter'=>"flowchart TD\nA[處理(1)]",'unquoted semicolon'=>"flowchart TD\nA[文字;]",'edge unquoted semicolon'=>"flowchart TD\nA[一]\nA -->|是;否| A") as $label=>$source){artifactReject(function()use($source){parseFlowchartSource($source);},'reject flowchart '.$label);}
foreach(array('end','subgraph','click','style','classDef','class','direction','linkStyle','flowchart','graph','END','ClAsSdEf') as $reserved){$source="flowchart TD\n".$reserved.'[文字]';artifactReject(function()use($source){parseFlowchartSource($source);},'reject reserved flowchart id '.$reserved);}
foreach(array('a"b','`markdown`','a\\b','<script>','a&b','&#65;','a#b','a|b',"a\tb", "a\x7fb",'https://example.invalid','www.example.invalid','data:text/plain,test','javascript:alert(1)','mailto:a@example.invalid') as $label){
    $source="flowchart TD\nA[".$label.']';artifactReject(function()use($source){parseFlowchartSource($source);},'reject unsafe node label '.json_encode($label));
    $source="flowchart TD\nA[安全]\nA -->|".$label.'| A';artifactReject(function()use($source){parseFlowchartSource($source);},'reject unsafe edge label '.json_encode($label));
}
foreach(array("\x01","\x0b","\x0c","\x7f","\u{0085}","\u{2028}","\u{2029}","\u{061c}","\u{200e}","\u{200f}","\u{202a}","\u{202e}","\u{2066}","\u{2069}") as $control){
    $source="flowchart TD\nA[正常".$control.'文字]';artifactReject(function()use($source){parseFlowchartSource($source);},'reject flowchart hidden control in label '.bin2hex($control));
    $source="flowchart TD\n%% comment".$control."click A call evil()\nA[正常]";artifactReject(function()use($source){parseFlowchartSource($source);},'reject flowchart hidden control in comment '.bin2hex($control));
}
artifactCheck(parseFlowchartSource("flowchart TD\n\tA[\"مرحبا\"]\n\tA --> A")['nodes'][0]['label']==='مرحبا','flowchart retains ordinary RTL text and tab indentation without bidi controls');
$maxLabel=str_repeat('中',80);$edgeLabel=str_repeat('中',40);$source="flowchart LR\nA[\"".$maxLabel."\"]\nA -->|".$edgeLabel.'| A';
artifactCheck(parseFlowchartSource($source)['nodes'][0]['label']===$maxLabel,'flowchart accepts exact 240/120 UTF8 label byte limits');
artifactReject(function()use($maxLabel){parseFlowchartSource("flowchart TD\nA[".$maxLabel.'x]');},'reject flowchart node 241 bytes');
artifactReject(function()use($edgeLabel){parseFlowchartSource("flowchart TD\nA[安全]\nA -->|".$edgeLabel.'x| A');},'reject flowchart edge 121 bytes');
$lines=array('flowchart TD');for($i=0;$i<40;$i++)$lines[]='N'.$i.'[節點'.$i.']';for($i=0;$i<80;$i++)$lines[]='N'.($i%40).' -->|連線'.$i.'| N'.(($i+1)%40);
$full=parseFlowchartSource(implode("\n",$lines));artifactCheck(count($full['nodes'])===40&&count($full['edges'])===80,'flowchart accepts maximum 40 nodes and 80 edges including cycles');
$extra=$lines;$extra[]='N0 -->|第81條| N1';artifactReject(function()use($extra){parseFlowchartSource(implode("\n",$extra));},'reject flowchart 81 edges');
$extra=$lines;$extra[]='N40[第41個]';artifactReject(function()use($extra){parseFlowchartSource(implode("\n",$extra));},'reject flowchart 41 nodes');
artifactReject(function(){parseFlowchartSource("flowchart TD\nA[一]\n%% ".str_repeat('x',12000));},'reject flowchart source over 12000 bytes');

// Check raw JSON identity before associative decoding can collapse object/array.
foreach(array('table','chart','flowchart') as $kind){$raw=json_decode(jsonEncode(artifactFixture($kind)));artifactCheck(validateArtifactJsonShape($raw)===$raw,'raw JSON accepts exact '.$kind.' schema');}
$raw=json_decode(jsonEncode(artifactFixture('table')));$raw->columns=(object)array('0'=>$raw->columns[0],'1'=>$raw->columns[1]);artifactReject(function()use($raw){validateArtifactJsonShape($raw);},'raw JSON rejects numeric-key columns object');
$raw=json_decode(jsonEncode(artifactFixture('table')));$raw->rows=(object)array('0'=>$raw->rows[0],'1'=>$raw->rows[1]);artifactReject(function()use($raw){validateArtifactJsonShape($raw);},'raw JSON rejects numeric-key rows object');
$raw=json_decode(jsonEncode(artifactFixture('table')));$raw->rows[0]->cells=(object)array('0'=>'一','1'=>'二');artifactReject(function()use($raw){validateArtifactJsonShape($raw);},'raw JSON rejects numeric-key cells object');
$raw=json_decode(jsonEncode(artifactFixture('table')));$raw->columns[0]=array('task','任務');artifactReject(function()use($raw){validateArtifactJsonShape($raw);},'raw JSON rejects column array in object position');
$raw=json_decode(jsonEncode(artifactFixture('table')));$raw->rows[0]->cells[0]=3;artifactReject(function()use($raw){validateArtifactJsonShape($raw);},'raw JSON rejects numeric cell type');
$raw=json_decode(jsonEncode(artifactFixture('flowchart')));$raw->chartType='script';artifactReject(function()use($raw){validateArtifactJsonShape($raw);},'raw JSON rejects unsupported chart enum');
$raw=json_decode(jsonEncode(artifactFixture('chart')));$raw->extra='ignored';artifactReject(function()use($raw){validateArtifactJsonShape($raw);},'raw JSON rejects extra field');
artifactReject(function(){validateArtifactJsonShape(artifactFixture('table'));},'raw JSON guard rejects associative root instead of stdClass');

class ArtifactFixtureAdapter {
    public $calls=0;public $history=array();public $type;public $mode='normal';public $raw=null;public $fixtureKind;
    public function __construct($type,$fixtureKind=null){$this->type=$type;$this->fixtureKind=$fixtureKind===null?$type:$fixtureKind;}
    public function generate($model,$messages,$schema,$maxOutputTokens=6000){
        $this->calls++;$data=json_decode($messages[1]['content'],true,128,JSON_THROW_ON_ERROR);
        $this->history[]=array('model'=>$model,'messages'=>$messages,'data'=>$data,'schema'=>$schema,'maxOutputTokens'=>$maxOutputTokens);
        if($this->raw!==null)return $this->raw;
        $props=$schema['properties'];$artifact=artifactFixture($this->fixtureKind);
        $candidate=array('artifact'=>$artifact,'rationale'=>'完整且具體的候選說明。','goalText'=>'本次候選自己的目標。','changeSummary'=>'依本次要求整理內容。');
        if(isset($props['directionStatus'])){
            $ready=$this->mode!=='exploring';$empty=array('purpose'=>'','audience'=>'','message'=>'','tone'=>'','constraints'=>'','summary'=>'','items'=>array());
            $out=array('reply'=>$ready?'方向已足夠，可確認後生成。':'可先提供必要資料。','question'=>$ready?'':'你要使用哪一份實際資料？','choices'=>array(),'directionStatus'=>$ready?'ready':'exploring','direction'=>$ready?artifactFixtureBrief($this->type):$empty);
        }elseif(isset($props['purpose']))$out=artifactFixtureBrief($this->type);
        elseif(isset($props['candidates'])){
            $out=array('candidates'=>array($candidate));
            if($this->mode==='extra_candidate')$out['candidates'][]=$candidate;
            if($this->mode==='invalid_artifact')$out['candidates'][0]['artifact']['extra']='not allowed';
        }elseif(isset($props['outcome'])){
            $base=$data['sourceVersion'];$artifact=$base['artifact'];
            if($this->type==='table')$artifact['caption']='修訂的表格說明';else $artifact['title']='修訂的圖表標題';
            $out=array('outcome'=>'revision','reply'=>'這是待審閱的修訂候選。','question'=>'','choices'=>array(),'artifact'=>$artifact,'rationale'=>'只修改本次要求的標題或說明。','goalText'=>versionGoalText($base),'changeSummary'=>'保留其他完整資料。');
            if($this->mode==='unchanged')$out['artifact']=$base['artifact'];
            if($this->mode==='goal_only'){$out['artifact']=$base['artifact'];$out['goalText']='本次明確更新的目標。';}
            if(strpos($this->mode,'clarification')===0){$out['outcome']='clarification';$out['artifact']=$base['artifact'];$out['reply']='可以先比較這個方向。';$out['rationale']='';$out['goalText']='';$out['changeSummary']='';}
            if($this->mode==='clarification_changed')$out['artifact']=$artifact;
            if($this->mode==='clarification_metadata')$out['goalText']='不應被保存的目標';
            if($this->mode==='clarification_claim')$out['reply']='已經修改完成。';
        }elseif(isset($props['artifact'])){
            $out=$candidate;if($this->type==='table')$out['artifact']['caption']='融合新表格';else $out['artifact']['title']='融合新圖表';
            if($this->mode==='copy_source')$out['artifact']=$data['selectedVersions'][0]['artifact'];
        }else{
            $items=array();foreach($data['selectedVersions'] as $version)$items[]=array('versionId'=>$version['id'],'fit'=>'依該版目標比較。','strength'=>'資料清楚。','tradeoff'=>'呈現不同。','suggestion'=>'依用途選擇。');
            $out=array('items'=>$items,'summary'=>'保留使用者決定。');
        }
        return json_decode(jsonEncode($out),false,128,JSON_THROW_ON_ERROR);
    }
}
function artifactLastCall($adapter){return $adapter->history[count($adapter->history)-1];}
function artifactModuleReject($adapter,$fn,$label,$code='MODEL_OUTPUT_INVALID',$calls=1,$status=502){$before=$adapter->calls;artifactReject($fn,$label,$code,$status);artifactCheck($adapter->calls===$before+$calls,$label.' exact model call count');}
foreach(array('table','chart') as $type){
    $adapter=new ArtifactFixtureAdapter($type);$module=new ArtifactModule($adapter,$type);$project=artifactFixtureProject($type);$source=$project['versions'][0];$model='fixed-fixture-v1';
    $brief=$module->discuss($project,'已提供必要資料。',$model);artifactCheck($brief['directionStatus']==='ready'&&$brief['direction']['items']===artifactFixtureBrief($type)['items'],$type.' ready direction has one fixed document definition');
    $adapter->mode='exploring';$discussion=$module->discuss($project,'尚未提供資料。',$model);artifactCheck($discussion['direction']===null&&$discussion['directionStatus']==='exploring',$type.' exploratory direction is not saved');
    $adapter->mode='normal';artifactCheck($module->summarize($project,$model)===artifactFixtureBrief($type),$type.' strict seven-field summary');
    $before=$adapter->calls;$candidates=$module->generate($project,'完整呈現。',$model);$call=artifactLastCall($adapter);
    artifactCheck(count($candidates)===1&&$adapter->calls===$before+1&&$call['model']===$model&&$call['maxOutputTokens']===24000,$type.' generates one complete candidate in exactly one fixed-model call');
    artifactCheck($candidates[0]['items']===artifactItems($candidates[0]['artifact']),$type.' authoritative artifact creates projection');
    artifactCheck(!isset($call['data']['versions'])&&count($call['data']['versionIndex'])===1&&$call['data']['contentType']===$type,$type.' initial generation context omits unrelated full artifacts');
    $adapter->mode='extra_candidate';artifactModuleReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},$type.' rejects extra candidate');
    $adapter->mode='invalid_artifact';artifactModuleReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},$type.' rejects extra artifact property');
    $adapter->mode='normal';$before=$adapter->calls;$revision=$module->refine($project,$source,'只更新標題或說明。',$model);$call=artifactLastCall($adapter);
    artifactCheck($revision['outcome']==='revision'&&isset($revision['artifact'])&&$revision['items']===artifactItems($revision['artifact'])&&$adapter->calls===$before+1,$type.' unadopted source candidate can produce full revision');
    artifactCheck($call['data']['sourceVersion']['artifact']===$source['artifact']&&!isset($call['data']['officialVersion'])&&$project['officialVersionId']===null,$type.' exact source artifact used without requiring official');
    artifactCheck($source===artifactFixtureVersion($type),$type.' immutable source remains untouched');
    artifactModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修訂',$model,array('document'));},$type.' rejects target item scope before model','TARGET_ITEMS_INVALID',0,409);
    $adapter->mode='unchanged';artifactModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改',$model);},$type.' rejects fake unchanged revision','MODEL_NO_REVISION');
    $adapter->mode='goal_only';$revision=$module->refine($project,$source,'只改目標。',$model);artifactCheck($revision['artifact']===$source['artifact']&&$revision['goalText']!==$source['goalText'],$type.' permits real goal-only revision with unchanged full artifact');
    $adapter->mode='clarification';$clarification=$module->refine($project,$source,'你覺得如何？',$model);artifactCheck($clarification['outcome']==='clarification'&&$clarification['items']===array()&&!isset($clarification['artifact'])&&!isset($clarification['goalText']),$type.' validated clarification echo discarded without version or goal');
    $adapter->mode='clarification_metadata';$clarification=$module->refine($project,$source,'討論',$model);artifactCheck(!isset($clarification['goalText'])&&!isset($clarification['artifact'])&&$clarification['rationale']==='',$type.' bounded clarification metadata is discarded, not a goal edit');
    foreach(array('clarification_changed'=>'MODEL_CLARIFICATION_ARTIFACT','clarification_claim'=>'MODEL_CLARIFICATION_CLAIM') as $mode=>$code){$adapter->mode=$mode;artifactModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'討論',$model);},$type.' rejects '.$mode,$code);}
    $adapter->mode='normal';$other=artifactFixtureVersion($type,'b');if($type==='table')$other['artifact']['caption']='第二來源';else $other['artifact']['title']='第二來源';$other['items']=artifactItems($other['artifact']);$other['goalAndRationale']='使用者最新保存的另一版目標。';
    $before=$adapter->calls;$fusion=$module->fuse($project,array($source,$other),'融合兩版。',$model);$call=artifactLastCall($adapter);
    artifactCheck($adapter->calls===$before+1&&$fusion['items']===artifactItems($fusion['artifact'])&&$call['maxOutputTokens']===24000,$type.' full fusion uses one fixed-model call');
    artifactCheck($call['data']['creativeGoal']===null&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale']&&$call['data']['selectedVersions'][1]['artifact']===$other['artifact'],$type.' fusion uses selected native snapshots and authoritative version goals');
    artifactModuleReject($adapter,function()use($module,$project,$source,$model){$module->fuse($project,array($source),'融合',$model);},$type.' rejects too few sources before model','FUSION_VERSIONS_INVALID',0,409);
    artifactModuleReject($adapter,function()use($module,$project,$source,$model){$module->fuse($project,array($source,$source),'融合',$model);},$type.' rejects duplicate sources before model','FUSION_VERSIONS_INVALID',0,409);
    $adapter->mode='copy_source';artifactModuleReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合',$model);},$type.' rejects copied source as fake fusion','MODEL_NO_REVISION');
    $adapter->mode='normal';$comparison=$module->compare($project,array($source,$other),'比較兩版。',$model);$call=artifactLastCall($adapter);
    artifactCheck(count($comparison['items'])===2&&$call['data']['selectedVersions'][0]['artifact']===$source['artifact'],$type.' inherited comparison receives complete native artifacts');
    $adapter->raw=(object)array('candidates'=>(object)array());artifactModuleReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},$type.' strict raw JSON object/array distinction');$adapter->raw=null;
}
// Flowchart-specific model workflow, alongside optional statistical chart fixtures.
$adapter=new ArtifactFixtureAdapter('chart','flowchart');$module=new ArtifactModule($adapter,'chart');$project=artifactFixtureProject('chart');
$source=$project['versions'][0];$source['artifact']=artifactFixture('flowchart');$source['items']=artifactItems($source['artifact']);$project['versions']=array($source);$model='fixed-fixture-v1';
$ready=$module->discuss($project,'請整理已提供的校對流程。',$model);$call=artifactLastCall($adapter);
artifactCheck($ready['directionStatus']==='ready'&&strpos($call['messages'][0]['content'],'不要求流程圖提供統計數字')!==false,'flowchart discussion does not require statistical data');
$generated=$module->generate($project,'使用流程圖。',$model);artifactCheck($generated[0]['artifact']['chartType']==='flowchart'&&count(parseFlowchartSource($generated[0]['artifact']['sourceText'])['nodes'])===3,'flowchart generation returns full valid graph artifact');
$revision=$module->refine($project,$source,'只修改圖表標題。',$model);artifactCheck($revision['artifact']['sourceText']===$source['artifact']['sourceText']&&$revision['artifact']['title']!==$source['artifact']['title'],'flowchart title revision preserves full source');
$adapter->mode='clarification';$clarify=$module->refine($project,$source,'討論流程。',$model);artifactCheck($clarify['outcome']==='clarification'&&!isset($clarify['artifact']),'flowchart clarification source echo is discarded');
$adapter->mode='normal';$second=$source;$second['id']=str_repeat('b',32);$second['artifact']['title']='第二個來源';$second['items']=artifactItems($second['artifact']);
$fused=$module->fuse($project,array($source,$second),'整合兩版。',$model);artifactCheck($fused['artifact']['chartType']==='flowchart'&&$fused['items']===artifactItems($fused['artifact']),'flowchart fusion returns full native snapshot');
$module->compare($project,array($source,$second),'比較流程。',$model);$call=artifactLastCall($adapter);artifactCheck($call['data']['selectedVersions'][0]['artifact']['chartType']==='flowchart','flowchart comparison receives complete graph artifacts');
echo 'PASS '.$artifactChecks." native artifact checks. No real provider or network used.\n";
