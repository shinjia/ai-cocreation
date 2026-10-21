# AI共創工作室架構與開發契約

本版里程碑：第四階段：圖文與海報原生排版。前九類功能保留，新增圖文與海報兩類原生排版；不等於 AI 像素生成。

## 模組與目錄

- `public/`：本機瀏覽器入口、一次性 HTTP 安裝、同源 JSON API、ES module UI 與明確標示的固定腳本示範。
- `app/app.php`：專案／項目狀態、固定模型綁定、操作路由、不可覆寫快照、容量預留。
- `app/modules/titles.php`：標題名稱的討論、方向、生成、指定來源修訂、比較及融合契約。
- `app/modules/text.php`：沿用上述流程的短文／長篇文章，另實作全文、段落範圍及長度驗證。
- `app/artifacts.php`、`app/modules/artifacts.php`：原生表格／圖表驗證、流程圖與 TSV 解析、完整作品生成／修訂／融合；`public/artifacts.js` 提供對應編輯器、安全 SVG 預覽及匯出。
- `app/mindmap.php`、`app/modules/mindmap.php`：已入圖樹／待選清單驗證、主題起步、選定節點待選修訂與受限融合；`public/mindmap.js` 提供原生 SVG、完整文字列表、草稿編輯及匯出，`public/mindmap-demo.js` 是獨立固定腳本替身。
- `app/vector.php`、`app/modules/vector.php`：有界原生幾何、精確投影、完整向量候選／修訂／融合；`public/vector.js` 提供安全 SVG、原生物件編輯器與匯出，`public/vector-demo.js` 是虛構固定腳本替身。
- `app/webpage.php`、`app/modules/webpage.php`：純文字原生單頁結構、固定主題、頁內目標驗證、完整候選／修訂／融合；`public/webpage.js` 提供安全 DOM、完整編輯與獨立 HTML／JSON／TXT 匯出，`public/webpage-demo.js` 是虛構固定腳本替身。
- `app/image.php`、`app/modules/image.php`：嚴格圖片中繼資料與實際圖片討論／比較；`app/image-actions.php` 核對已保存來源、一次性同意、上傳與模型輸入來源。
- `app/png-upload.php`：有界 PNG 驗證及正規化；`app/media-store.php`：同一 SQLite PDO 的私有 BLOB 與上傳收據；`public/media.php` 為同源 POST 端點。
- `public/image-upload.js`：本機 PNG／JPEG 檢查、旋轉與縮圖；`public/media.js`：同源上傳／讀取；`public/image.js`：授權 Blob 預覽與純文字中繼資料編輯。
- `app/composition.php`、`app/modules/composition.php`：圖文／海報完整原生結構、固定文字模型與 metadata-only 契約；`app/composition-actions.php` 驗證同專案固定引用、歷史來源與私人媒體。`public/composition.js` 提供原生編輯／預覽，`public/composition-export.js` 提供有界、逐圖驗證的 HTML 及 metadata-only JSON／文字 TXT 匯出。
- `app/content.php`：各類型內容／段落定義及完整內容限制；驗證不默默截斷正文。
- `app/versioning.php`：主／小版本、舊版讀取、封存、合併目標與比較快照。
- `app/members.php`、`model.php`、`ollama.php`：非秘密成員設定及兩家 provider adapters。
- `tests/`：來源契約、前端／示範、SQLite、PHP fixture；`phase1.php` 覆蓋第一階段流程，`artifacts.php` 為表格／圖表契約 fixture，`mindmap.php` 為心智圖契約 fixture，`vector.php` 為原生向量與數值 schema fixture，`webpage.php` 為原生網頁、完整版本與三部分方向確認 fixture。本次缺少原生 PHP，未執行 PHP fixture。

`moduleRegistry()` 的固定順序為 `titles` 標題名稱、`short_text` 短文、`article` 長篇文章、`illustrated` 圖文、`table` 表格、`chart` 圖表、`mindmap` 心智圖、`vector` 向量圖形、`image` 圖片創作、`poster` 海報設計、`webpage` 網頁、`interactive` 互動視覺程式。除 `interactive` 外共十一個 enabled；圖片只提供上傳、分析與比較，不生成／修改／融合像素。圖文與海報生成的是原生文字／既有圖片排版，非新圖片。互動視覺程式保留規劃／引用，尚無生成或定稿能力。「共聊」排除。

## 正規資料與相容讀取

SQLite `projects.body` 保存專案：`id`、`title`、`description`、`aiBinding`、`projectLifecycle`、`revision`、`sharedContextRevision`、`activeItemId`、`creativeItems`、`projectFinalizations`，另有預設 null 的 `imageAnalysisConsent`。

每個 creative item 各自有類型、名稱、說明、封存狀態、phase／lifecycle、messages、brief、versions、officialVersionId、comparisons、finalizations、references 與 contextRevision。API 加上 activeItem 並把選取項目的工作欄位投影到頂層；頂層 id／title／description／revision 仍是專案，不得把投影寫成第二份持久內容。

`normalizeRaw()` 將缺少的 `aiBinding` 讀為 null，不能從現行中央設定或舊 provenance 推測綁定。項目 enabled 依現在登錄重算，因此舊 `article`、`table`、`chart`、`mindmap`、`vector`、`webpage`、`image`、`illustrated`、`poster` 規劃項目可開始使用對應模組，原訊息、版本、定稿、引用不因此重寫。舊版本 `number=n` 讀為主版 Vn，保留 ID、內容與實際來源；缺少的歷史資訊不補造。

## 一次性專案模型綁定

中央 roster 每位成員有穩定 ID、nickname、enabled、provider、model、ollamaUrl，最多 20 位；owner 設定含 activeMemberId、settingsRevision、usageConsent、consentAt，不含 Key。中央 activeMemberId 用於設定／連線檢查，不是專案推論路由。

`new` 可由明確 memberId 建立 `aiBinding`；沒有已啟用成員時可先建立 null 綁定空專案。`bind_project_model` 只接受目前 aiBinding=null 的未結案專案，驗證專案 revision、中央 expectedSettingsRevision 與啟用成員，固定保存 memberId、memberNickname、provider、model、ollamaUrl、boundAt。已綁定後不提供換模型操作。

所有推論先經 `projectConnection()`：原成員須仍存在且 enabled，provider／model／ollamaUrl 必須與綁定完全一致，否則拒絕，不使用中央新 activeMemberId 或其他 fallback。中央改稱呼不改專案綁定稱呼及舊歷史。新結果的 provenance 保存 memberId、memberNickname、provider、requestedModel、actualModel、requestedAt；actualModel 未回報就保留 null。

舊單一設定可讀成「原有設定」成員，但 usageConsent=false。首次或新增啟用成員、更改服務／模型／目的地後須在設定明確核對同意；這不等於永久儲存 Key，也不改變已綁定專案目的地。

## 討論、方向與操作契約

初次 `discuss` 的同一次模型回覆含 reply、question、choices、directionStatus、direction：

- `directionStatus=exploring`：可釐清一個必要重點；direction 仍做結構／長度驗證但不保存為方向。
- `directionStatus=ready`：必須提供有效完整方向；question 空、choices 空。保存 brief、summaryRevision，phase=summary，goalApprovedAt 仍為 null。沒有固定輪數條件，不為判斷 ready 額外呼叫模型。
- UI 明確按「確認方向並生成候選」呼叫 `confirm_generate`，以最新 summary／revision 確認方向並生成一次。方向備妥不會自動生成；新構思對談可更新方向。既有 summarize／approve_goal／generate 路由保留相容，但不是畫面要求的固定分段流程。

網頁另以 `brief.tone` 對應視覺風格、`brief.message` 對應內容結構、`brief.constraints` 對應操作功能與限制。三個 checkbox 只存在目前頁面，不呼叫模型或保存作品。`confirm_generate` 必須傳入順序精確為 `["style","content","functions"]` 的 `confirmedDirections`，並以整數 `directionRevision` 等於當前 `summaryRevision`；伺服器不只相信按鈕狀態。新的待確認方向與相關脈絡失效會要求重新確認。通過後才由同一次明確操作生成候選，確認內容以 `directionConfirmation` 保存於既有目標確認對話，包含該 summary revision 及三部分文字。相容的 `approve_goal` 也核對相同契約；既已確認且方向未變的再生成仍須使用者明確按鈕，不自動呼叫。

圖片不使用 confirm_generate／generate／fuse；相容 approve_goal 只確認方向，不推論、不生成圖片。明確上傳可先建立候選，定稿仍須有效方向及正式版。

phase 為 discussion → summary → ready → work；項目及專案 lifecycle 各自為 created → in_progress → finalized。相關共同脈絡變動會使方向確認失效。新批次生成及定稿須有效方向；指定既有版本修訂、來源版本手動另存、比較及融合不藉此強迫重走初次構思，也不假造確認。只有明確 reopen 才解除定稿／結案，過往快照保留。

## 指定來源修訂與完整快照

`discuss.baseVersionId` 指定目前項目的未封存來源；省略時相容地使用 officialVersionId，沒有來源才走初次討論。候選不需先 promote。來源、revision、itemId、唯讀狀態與容量均先驗證，不允許借用另一項目版本。

- 標題名稱修訂回傳完整 items，保留既有 id／label；只在明確要求下新增內容欄位，刪除／改名應改用手動編輯。
- 短文固定一項 `{id:"body",label:"全文",content:...}`，修訂保存完整全文，不接受段落 targets。
- 長篇文章必須明確提供非空、無重複且屬於來源的 `targetItemIds`，不預設全選。模型取得完整 `sourceVersion.items` 及目標；schema 與伺服器限制它只回傳選取段落，id／label 必須保持。未選段落沿來源原陣列逐位元組保存，保持順序，再與選段合併為完整新文章並重新驗證。
- AI 選段不可新增、刪除、改名或重排段落；手動 snapshot 可改結構，保存完整新版、既有 ID 與新段落新 ID，來源仍不變。

`outcome=revision` 必須有實際內容或本版目標差異、完整可審閱內容與 metadata，question／choices 為空。追加來源 major 的下一 minor，保存 basedOnVersionId、revisionInstruction、targetItemIds、provenance 及來源對話。文字模組的 `outcome=clarification` 必須 items=[]，不建立假版本；有界說明 metadata 驗證後丟棄。表格／圖表／心智圖／向量圖形／網頁／圖文／海報的模型 schema 則要求完整 artifact：釐清時必須原樣回傳來源 artifact，驗證與來源相同後捨棄，不建立版本或修改目標。多問、明顯假稱修改完成或畸形輸出拒收；有界文字檢查不是完整語意理解保證。

每版是不可覆寫的完整快照，不只保存差異。文字版保存 `items:[{id,label,content}]`；表格／圖表／心智圖／向量圖形／網頁／圖文／海報另保存具型別的完整 `artifact`，items 僅是伺服器從 artifact 衍生的相容文字投影，不能取代原件。`id` 是識別碼；`major`／`minor` 是整數，V5.10 不是浮點數。主版取目前最大 major+1；小版取來源 major 下最大 minor+1，封存版也計入。`basedOnVersionId` 指實際來源，不以相鄰版號推測。

`goalAndRationale` 為單一、非空、最多 12,000 UTF-8 bytes 的本版目標與修改意見；有此欄位就優先使用。舊 goalText／goalSnapshot／changeSummary／rationale 留作相容歷史，缺合併欄時才組合不同既有文字，不重寫舊快照或捏造紀錄。AI metadata 取自同一次回覆，手動輸入驗證後保留，不猜測拆分。

只有 `promote` 改 officialVersionId；只有 `titles` 同步更改 creative item 名稱，不更改短文／文章／表格／圖表／心智圖／向量圖形／網頁／圖片／圖文／海報項目名或專案 title／description。主名稱優先明確中文／主要標籤，再名稱／標題，最後第一項；導覽名稱最多取 59 個 Unicode code points 加省略號，正文不截短。生成、融合、修訂或手動另存不自動 promote。

## 比較、融合、引用與封存

`compare` 僅接受目前項目 2–5 個不同、未封存版本，模型取得每版完整內容與自己的目標／修改意見。逐版回傳 ID 必須完全匹配；不使用目前共同目標統一評分、不選唯一冠軍。保存 goalBasis=version_snapshots、versionGoalSnapshots、goalSnapshot=null 及 provenance；比較不修改作品。

`fuse` 是另一個明確操作及一次模型呼叫，同樣要求 2–5 個有效來源；結果是一個完整新主版候選，source=fusion、basedOnVersionId=null，保存 fusionSourceVersionIds、fusionSourceSnapshots、fusionInstruction、當次目標及採納／捨棄說明。所有來源與目前正式版不變，不由比較自動觸發。

固定引用保存來源版本完整內容及直接模型來源，下一層引用只留 ID／模型來源，避免無限遞迴複製。來源改版、封存或換正式版不改固定引用。archivedVersionIds 與不可變內容分離；正式版不得封存，封存不釋放容量。還原後才可作新修訂、比較、融合或引用來源。項目封存與版本封存互相獨立。

## 原生表格／圖表契約

`artifact` 是來源權威，精確接受以下欄位，不接受額外欄位：

- table：`{kind:"table",caption,columns:[{id,label}],rows:[{id,cells:[string,...]}]}`。每列 cells 數須等於 columns 數；列／欄 ID 各自唯一、ASCII 英數開頭，只含英數、底線與連字號，最多 64 字元。儲存格保留前後空白，可為空字串，只作文字。
- chart：`{kind:"chart",chartType,title,xLabel,yLabel,sourceText}`。chartType 為 `flowchart`（預設）、`bar`、`line`、`pie`。流程圖不使用座標軸，編輯器隱藏 xLabel／yLabel；保留這兩個欄位以維持共用結構。
- `validateArtifact()` 驗證完整結構及語意；HTTP／模型輸入另驗證真正 JSON 物件與陣列型別，不把 associative decode 後相似的形狀混用。前端驗證改善操作，後端仍為最後依據。
- `artifactItems()` 產生固定一項 `document／表格內容` 或 `document／圖表來源`。手動 snapshot 與 AI 結果都以 artifact 重新產生投影，不信任外來 items。一般短文／文章的欄位格式不得充當表格或圖表。

`ArtifactModule` 沿用固定模型與同次 ready／exploring 判斷；每次生成恰一份完整候選。修訂來源可以是候選或正式版，整份 artifact 回傳，不接受文章 targetItemIds。只有內容或本版目標實際改變才另存小版。融合須明確選 2–5 版，保存新的完整主版候選與全部直接來源快照；不能照抄單一來源假稱融合。

候選、修訂、手動主／小版、比較、融合來源、跨項目固定引用、定稿及專案 JSON 都保留完整 typed artifact。來源與正式版不被自動替換；舊版本若沒有 artifact，介面明示不能安全預覽，不從文字摘要補造原生作品。未選歷史只傳版本索引，修訂／比較／融合傳完整所選來源與各版自己的目標。

### 流程圖解析與預覽

`parseFlowchartSource()` 的結果為 `{direction,nodes:[{id,label,shape}],edges:[{from,to,label}]}`。來源是受限 Mermaid 風格子集，不使用完整 Mermaid runtime／CDN：

- 首個有效行為 `flowchart TD`、`flowchart LR`，也接受 `graph` 與 `TB`；解析方向將 TB 視為 TD，保存的 sourceText 不因此重寫。
- 每行只宣告一個方框 `A["文字"]`、菱形 `B{"判斷"}`、圓角框 `C("開始")`，或一條 `A --> B`／`A -->|標籤| B`。端點必須獨立宣告，可先連線後宣告；不能 inline 宣告或鏈式連線。ID 以英文字母開頭，僅含英數及底線，最多 40 字元，保留字不分大小寫拒絕。
- 1–40 個不重複節點、0–80 條連線，相同起點／終點／標籤不可重複；允許循環與自我連線，排版採有限步驟，不以無界遞迴走訪。
- 標籤僅受限純文字，含括號／分號須以外層雙引號包住；來源拒絕特殊換行及雙向控制字元。空白行、一般 `%%` 註解及單一行尾分號可用。拒絕初始化 directives、子圖、樣式／class、click、HTML、Markdown、網址、圖片、任意屬性與程式碼，不作寬鬆的靜默略過，不解碼 HTML entities 或跳脫序列。完整語法使用範例見[使用指南](USER-GUIDE.md)。
- 以固定 SVG 元素／屬性和文字 DOM 產生簡化圖形，另顯示完整節點及連線列表；圖面長文字可縮略，不改原件。SVG 排版不是 Mermaid 的排版結果，也不保證複雜圖沒有重疊。

### 統計 TSV 與匯出

bar／line／pie 來源使用 TSV，第一列含分類標頭及 1–5 個唯一非空數列名稱，後續 1–24 列的欄數須一致，分類名稱唯一。數字僅嚴格十進位、有限且絕對值不超過 1 兆；拒絕公式、科學記號、NaN、Infinity、千位分隔與數字前後空白。pie 恰一數列、非負且總和大於零。解析標頭／分類名稱時 trim，保存來源文字仍保留原格式。

圖表來源僅將 CRLF 正規化為 LF，單獨 CR 拒絕；切換圖表模式不改寫或清除 sourceText，無效草稿保留並顯示錯誤。統計生成與融合不得補造數字或任意相加不同統計口徑；流程圖不要求統計資料，也不能憑空補成使用者的真實流程。

介面提供表格 CSV／TSV、流程圖 MMD／SVG、統計圖 TSV／SVG，以及圖表來源複製；匯出函式另接受流程來源 TXT。單件匯出只處理已保存版本，不呼叫模型或外部服務。CSV／TSV 為可疑公式文字加前置單引號；統計數值欄保持原驗證數字，不把負數轉成文字。表格 CSV／TSV 不含 caption／ID，MMD 只含 sourceText；完整原始文字、metadata、版本與來源關係保留在專案 JSON。沒有實作圖坊連接器、雙向同步或已驗證的匯入相容性。

## 原生心智圖契約

心智圖使用獨立 `MindmapModule`，不是流程圖來源或文字段落的別名。權威 `artifact` 精確為 `{kind:"mindmap",rootId,nodes,proposals}`；兩份清單的每筆精確含 `{id,parentId,label,description}`，不接受額外欄位。ID 為 ASCII 英數開頭、只含英數／底線／連字號、最多 64 字元，兩份清單合併後仍須唯一。

- `nodes` 是已加入樹：1–80 筆，恰一個空 parentId 的根，ID 必須等於 rootId。所有節點沿父鏈到根，拒絕循環、孤立或不存在的父節點。
- `proposals` 是全圖 0–24 筆待選建議，不能充當已入圖節點；每筆 parentId 必須在 nodes，不能指向另一筆 proposal。名稱／說明原字串、空白及順序保留；名稱非空且最多 240 bytes、說明最多 2,000 bytes，完整 JSON 與完整文字投影各最多 60,000 bytes，超限整筆拒絕而不截斷。
- `mindmapItems()` 從完整 artifact 生成固定 `document／心智圖來源` 一欄，清楚分開完整已入圖樹及待選清單。它只供相容讀取，不能代替原生結構；手動 snapshot 不信任呼叫者另傳的 items。

### 主題起步與選定節點探索

已有可探索主題就可判定 ready；用途、讀者、語氣和限制可保持未知，不強迫預先收斂。初次明確確認生成恰一個候選：nodes 只能有一個主題根，proposals 為 2–12 個全部直屬該根的待選分支。伺服器在模型回覆後再驗證數量及結構，不接受 AI 偷先入圖，並加入明確的未採用提示。

指定來源的 `discuss` 必須帶 `baseVersionId` 與 `targetNodeId`；後者須屬於該已保存來源的 nodes，不接受 pending-only 節點、其他版本／項目的節點或文章 targetItemIds。路由於推論前驗證，將 mindmapTargetNodeId 傳入模組；對談選項 context 也綁定 targetNodeId，選擇變動後舊選項失效。

AI 修訂只能以 2–12 個新待選子分支取代目標節點的原待選集合，或依要求只改本版目標。rootId 和 nodes 的 ID、父子關係、名稱、說明及清單順序逐字保持；其他父節點的 proposals 連相對順序都保持原樣。新集合須遵守全圖 24 個待選與整體容量，不刪其他待選分支騰空間。只重排同一待選集合或換摘要不算修訂。結果保存來源主版下的完整小版及 targetNodeId，未採用、不覆寫來源。模型的 revision 回覆由伺服器換成如實的待選變更提示，避免假稱已改入圖內容。

只評價、要求手動改名／說明／整理或必要釐清時，可回 clarification，必須原樣回傳完整來源 artifact；驗證相同後捨棄 artifact 及修訂 metadata，不建立版本。此邊界是結構與來源核對，不等於保證模型所有語意正確。

### 頁面草稿、整理與匯出

`public/mindmap.js` 的純函式不寫入、不推論、不聯網。節點選取與 checkbox 本身不改 artifact；只有明確按加入才把勾選 proposal 移至 nodes，沿用 ID 並移出待選區。自填分支、名稱／說明套用、移動、合併、空末端節點移除都先修改完整本機草稿。

移動與合併禁止以根為來源、自己或後代為目的。合併保留目的名稱，把來源名稱及說明追加到目的說明，轉移全部子節點及待選分支，超限原子拒絕。只有沒有子節點或待選分支的非根末端可移除。編輯器保存最多 20 步本次草稿復原，不是持久版本復原。

尚未套用的節點／自填欄位以節點為鍵暫存，選節點或介面重畫不當作已保存；尚有欄位草稿時，禁止會直接丟掉它們的合併、刪除、復原及外層另存。先套用或明確放棄，再另存完整主／小版。AI 仍只讀已保存來源，不讀這份未另存草稿；新草稿節點須另存後才可作 AI 目標。重新整理不保證保留草稿。

預覽以自製安全 SVG 畫 nodes 的父子關係，不畫 proposals；文字 DOM 列出全部名稱、說明與父節點，另列清楚標示的待選清單。圖面長名稱可縮略，原件及完整列表不截短。選取可透過圖面、原生按鈕或選單，不會觸發 AI。

單件匯出只處理已保存版本：SVG 畫已入圖樹，JSON 保存完整 artifact（含待選），TXT 保存兩者清楚分隔的完整提綱。單件檔不含共創歷史；專案 JSON 才保留版本、模型來源、比較與固定引用。只有明確操作才下載，匯出不推論、不改正式版。

### 心智圖融合

比較沿用各版自身目標的契約。另一次明確 fuse 選 2–5 版，才能形成新的完整主版候選與直接來源快照。融合的每個已入圖節點，其 id、label、description 三欄必須同時相同於某一選定來源 nodes 的一筆；只能重組 parentId 形成合法樹，不能拿 proposals 或新造文字充當已入圖節點。新探索角度仍只放 proposals；不可照抄任一來源完整 artifact 假稱融合。所有原來源與正式版保持不變，不自動選勝者或收斂。

固定腳本的融合比真實模型路徑更窄：只合併同根且完整節點記錄相容的已入圖集合，保留待選狀態；不同根、ID 內容／父子／狀態衝突或沒有實質新增已入圖內容時拒絕，不推測使用者意圖。示範不是模型分析或真實資料驗收。

## 原生向量圖形契約

`VectorModule` 沿用固定專案模型、同次 ready／exploring、各版自身目標及明確採用流程。它使用同一文字／結構化模型產生幾何，不呼叫圖片端點、不追蹤點陣圖、不新增付費圖片服務。權威 artifact 精確為 `{kind:"vector",title,width,height,background,shapes}`，不接受原始 SVG／XML／HTML 字串或額外欄位。

### 幾何、數值與容量

- 畫布 width／height 是 1–4096 的整數；title 最多 600 UTF-8 bytes。background、各 fill／stroke 只接受六位十六進位色碼或 `none`，不接受 CSS 色名、url()、漸層、濾鏡或外部資源。
- shapes 是 1–100 個完整物件，精確含 `id,type,label,x,y,width,height,fill,stroke,strokeWidth,opacity,text,fontSize,points`。ID 穩定且全圖唯一，沿用共用 ASCII 64 字元規則；label 最多 120 bytes。清單順序就是由後至前的圖層，不排序、不去除重複幾何。
- type 僅有 rect、ellipse、line、polygon、polyline、text。rect／ellipse 的 x、y 是外接框左上角且寬高大於零；line 由 (x,y) 到 (x+width,y+height)，寬高是可負的位移。polygon／polyline／text 的 width／height 必須為零。
- x、y 及每個局部頂點範圍為 -4096 至 8192；width／height 為 -8192 至 8192；strokeWidth 為 0–100，opacity 為 0–1。polygon 有 3–80、polyline 有 2–80 個 `{x,y}` 局部頂點，再加物件 x／y 平移；其餘類型 points 必須為空陣列。
- text 物件文字非空白、最多 4,000 bytes，fontSize 為 1–512，x／y 是首行基線。其他類型 text 必須空字串，fontSize 必須為 0。原始空白與換行保留，不把文字解析為標記或連結，不下載字型。
- JSON number／integer 只接受有限原生數字，不接受數字字串、布林值、null、NaN 或 Infinity。共用原始 schema 在失真轉換前檢查物件／陣列、數字型別、整數性及 minimum／maximum；數學上為整數的 JSON 1.0 可作整數。向量語意層再驗證最多三位小數與跨欄位條件，超精度拒收，不以四捨五入改圖。
- `vectorCompactJson()` 對已驗證資料產生固定 schema 欄位順序、無科學記號／負零的精確緊湊投影，保留字串與陣列順序及 PHP 的 U+2028／U+2029 跳脫。`vectorItems()` 固定為 `document／向量圖形來源` 一欄，內容是完整緊湊 JSON，不是圖片描述。模型結果及手動 snapshot 皆由 artifact 重算，不信任外來 items。
- 原生 artifact 經伺服器 jsonEncode 序列化及緊湊投影各最多 60,000 bytes，均不可截斷。非預設 PHP `serialize_precision` 可能讓伺服器序列化較長；即使前端緊湊投影通過，後端最終 byte guard 仍可拒收，不保證所有 PHP 設定有完全相同的容量邊界。

### 完整修訂、比較與融合

每次生成恰一份完整候選。修訂以完整已保存來源及本次指令為起點，不接受文章 targetItemIds；本版合併目標優先於舊欄位。作品或本版目標必須有實質差異，才保存完整小版。釐清必須原樣回傳來源 artifact，精確投影核對後捨棄，不建立版本或改目標。修訂回覆明示候選尚未採用，不讓模型宣稱已替換正式版。

比較繼承各版自身目標的契約，不使用目前共用目標統一排名。明確融合 2–5 版才呼叫一次模型、另存完整主版候選與所有直接來源快照。`vectorDrawingFingerprint()` 忽略標題、物件 ID／label，僅在這份衍生指紋中將等值色碼大小寫視為相同；原生快照與投影不改寫原色碼。它保留畫布、背景、所有繪製欄位、順序與重複物件數量；若與任一來源繪製資料相同則拒收，不能只換名稱冒充融合。這是結構差異檢查，不是保證視覺品質的圖像判讀。

### 編輯、預覽與匯出

原生 editor 可選取物件、套用畫布或物件欄位、新增／複製／移除、前後移一層及復原最近 20 步草稿。新增與複製產生新 ID；複製位置不自動偏移。選取圖面、完整清單或選單本身不改作品、不推論。沒有拖曳、path、貝茲曲線或任意圖形匯入。

未套用的畫布／物件欄位以 uiState 暫存，切換選取、同頁 state 讀取及忙碌／唯讀重畫時保留，過期 editor token 不可改新狀態。尚有未套用內容時，新增、複製、重排、移除、復原與外層另存會阻擋；先套用或明確放棄，再另存完整主／小版。草稿與 20 步復原只在目前頁面，整頁重新整理或關閉即失去，不是持久化或自動保存。AI 操作只讀已保存來源。

預覽與匯出只由固定 SVG 元素／屬性生成 rect、ellipse、line、polygon、polyline、text／tspan，文字安全跳脫，不接受任意 SVG、事件屬性、CSS、JS、圖片、URL、外部字型或資源。畫布以 viewport 裁切顯示，超出範圍的幾何仍保留在原生 JSON 和完整文字列表，不截短資料。

明確匯出已保存版本才生成 SVG／JSON／TXT，不讀未另存草稿、不呼叫模型或外部服務。SVG 保留獨立幾何及文字，未點陣化；文字用通用 sans-serif，第三方呈現與字型不保證相同。JSON 與 TXT 均為完整緊湊原生 JSON，TXT 不另作白話摘要。單件檔不含完整共創歷史，專案 JSON 才保留模型、引用與各版紀錄。「形坊」目前名稱、匯入規格及相容性尚未驗證，未提供其連接器或雙向同步。

固定腳本使用虛構的五物件晨光書屋，不解析使用者真實主題。只支援逐字作品標題／單一物件填色或外框色修改；改作品標題不改圖內文字，無法辨識或不產生變更的要求只釐清。示範融合只追加畫布／背景相同、同 ID 完整內容一致的圖層；不同來源衝突或與任一來源繪製資料相同則拒絕，不猜測設計取捨。

## 原生網頁契約

網頁使用獨立 `WebpageModule`，沿用專案固定文字／結構化模型，不需要圖片模型、網頁執行服務或部署端點。權威 artifact 精確為 `{kind:"webpage",title,theme,navigation,sections}`，沒有 HTML、CSS、JavaScript 或任意屬性欄位。theme 僅接受 `paper`、`midnight`、`meadow`，navigation 為真正 JSON boolean。

- sections 有 1–20 筆，順序就是呈現順序；每筆精確包含 `{id,type,eyebrow,heading,body,entries,actionLabel,actionTarget}`。type 僅接受 `hero`、`text`、`cards`、`faq`、`cta`。區塊 ID 全頁唯一、最多 64 個 ASCII 字元，英數開頭，只含英數、底線與連字號。
- cards／faq 的 entries 必須為 1–12 筆，其他區塊一律為空陣列。每筆精確為 `{id,title,body}`；條目 ID 在同一區塊內唯一，既有內容沿用 ID，新內容新增 ID。
- hero 可選擇頁內按鈕，cta 必須有按鈕；其他區塊的 actionLabel／actionTarget 必須同時為空。按鈕文字與目標須成對，target 只能是同一完整 artifact 內存在的區塊 ID，不接受 URL、帶 `#` 的片段、DOM 選擇器或其他創作項目。
- title／heading／條目 title 非空且最多 600 UTF-8 bytes；eyebrow／actionLabel 最多 240、body 最多 12,000、條目 body 最多 6,000 bytes。字串保留空白、換行及標記，只作純文字；原始 JSON 的物件／陣列與布林型別在正規化前核對，不寬鬆轉型。
- `validateWebpageArtifact()` 建立固定欄位順序，`webpageCompactJson()` 保留完整原生 JSON，U+2028／U+2029 跳脫與前端一致；完整正規 UTF-8 JSON 最多 60,000 bytes。`webpageItems()` 只生成 `document／網頁來源` 的相容文字投影，不能取代原件，不信任客戶端另傳的 items；超限整筆拒收，不截短。

### 生成、修訂、引用與完整版本

同次對談可以提供三部分待確認方向，但 ready 不代表已同意。逐項確認且明確 `confirm_generate` 才生成恰好一份完整候選。指定版本修訂以完整 artifact 為唯一來源，不接受文章 targetItemIds，也不讀頁面草稿。釐清須原樣回傳來源 artifact，驗證相同後丟棄作品及修訂 metadata，不造假版本；有內容、操作或本版目標實質變更才保存完整小版；只改目標須保留精確原件，不能藉目標或摘要變動夾帶純 ID 改名。

`webpageContentFingerprint()` 保留標題、主題、導覽、完整文字、順序與重複數量；忽略區塊及條目 ID 的純改名，把按鈕目標轉為區塊位置以維持連結語意。融合必須與每一個來源的內容指紋不同，不能只改 ID 假稱整合；這是結構檢查，不代表模型的設計品質已驗證。每版自己的 goalAndRationale 優先於舊目標欄；比較與明確融合分離，融合增加完整主版候選與全部直接來源，不自動採用。

同專案其他項目僅在使用者明確釘選特定版本後作引用材料，保存完整內容及模型來源，不隨來源改版或正式版更換而同步。即使引用已保存的圖文或海報，網頁模組仍只讀固定文字／原生資料，不取得圖片像素，也不因此新增網頁圖片嵌入、外部資源或生圖能力。修訂、手動主／小版、比較、融合、引用、正式版與定稿都保存完整原生作品，不改已保存來源或專案固定模型。

### 草稿、原生互動與匯出

`public/webpage.js` 提供完整頁面編輯：網頁標題／固定主題／導覽開關、區塊文字／順序／增刪、卡片／問答文字及順序。選取區塊不改 artifact；欄位須明確套用到草稿，外層另存才建立版本。未套用欄位依區塊 ID 暫存在 uiState，與已套用草稿分開；同頁切換區塊、busy 重畫或狀態讀取仍保留。須先套用或明確放棄，才允許會丟字的結構操作、復原及外層另存。最多保留 20 步草稿復原，不寫瀏覽器持久儲存，整頁重新整理／關閉會失去未另存內容。

預覽使用固定 DOM 元素與 app-owned CSS，文字以 textContent 建立，不用 innerHTML 或 iframe 執行任意來源。每個預覽產生獨立 DOM ID，頁內導覽只移動／聚焦該作品區塊；FAQ 是原生 details／summary。固定響應式規則處理窄螢幕，沒有自訂 CSS、外部圖片／字型／連結、表單、登入、付款、API 或自動部署。

明確匯出已保存版本時，HTML 以固定元素序列化並安全跳脫全部使用者文字，head 的 charset 後即放 CSP，再放固定內嵌 CSS；沒有 JavaScript 或資源請求。匯出 CSP 預設拒絕來源，僅允許固定內嵌樣式，並明確禁止腳本、圖片、字型、連線、frame、object、media、worker、base 與表單送出。這是獨立匯出檔的策略，不放寬工作室主頁 CSP，也沒有新增 iframe／程式執行端點，不宣稱為任意程式碼安全沙箱。

JSON 保留完整可編輯原生資料，TXT 是同一份正規 JSON 的純文字檔。匯出不含未另存草稿、不呼叫 AI、不上傳或部署；尚無網頁 HTML／JSON 檔案匯入介面。單件匯出不含完整歷史，專案 JSON 才保存全部版本、比較、模型與引用來源。

固定腳本使用虛構街角故事日五區塊網頁，不解析真實需求。只處理明確格式的網頁標題、單一區塊標題／內文、固定主題及導覽開關；其餘只釐清或交由手動編輯。固定融合要求主題及導覽相同、同 ID 區塊完整相容，依來源順序追加，不猜測衝突或丟棄資料；與任一來源內容相同時拒絕假融合。

## 外部圖片、私人媒體與實際分析契約

### 原件與本機準備

圖片 artifact 精確為 `{kind:"image",title,alt,attribution,asset}`，asset 精確含 `{id,mime,width,height,byteLength,sha256,normalization}`。title 非空、最多 600 UTF-8 bytes，alt 最多 3,000、attribution 最多 2,000；asset ID 是 32 個小寫十六進位字元，SHA-256 是 64 個；mime 固定 `image/png`、normalization 固定 `png-v1`。寬高各 1–2048、byteLength 1–4,194,304，真正整數，不接受額外欄位、外部 URL、路徑、原檔名或內嵌位元組。`imageArtifactItems()` 產生完整中繼資料投影，不表示圖片已嵌入 JSON；形狀驗證也不證明 owner 或資產存在。

瀏覽器原始檔最多 12 MiB、寬高各最多 8192、總像素最多 16,777,216。以真實位元組識別靜態 PNG 或 8-bit 基線式／漸進式 JPEG，不信任副檔名／MIME；PNG 預檢掃描完整區塊、CRC、動畫控制與結尾，JPEG 預檢有界區段／掃描，不把標頭檢查冒充完整解碼。拒絕 APNG、GIF、SVG、WebP 及尾隨資料。來源 PNG 的調色盤、灰階、高位元深度或交錯只在瀏覽器可解碼的前提下轉換，不能原樣傳入伺服器。

使用 createImageBitmap（imageOrientation=from-image）或在該 API 不存在時才使用本機 Blob URL Image，實際解碼後再核對尺寸。依指定 0／90／180／270 度順時針旋轉，比例縮至最長邊 2048、不放大，以 alpha canvas 輸出最多 4 MiB PNG；失敗不偷偷改用另一解碼路徑。decoder、canvas 及 Blob URL 在成功／錯誤時釋放。選檔與準備不聯網、不上傳、不推論；原始檔不改動，檔名不作標題或上傳檔名。

### PNG 正規化與資源上限

`normalizeUploadedPng()` 接收有界位元組，不讀任意路徑。驗證簽章、最多 1024 個區塊、IHDR／連續 IDAT／IEND 順序、長度、CRC 及無尾隨資料；只接受非交錯 8-bit RGB／RGBA（color type 2／6）、每邊 2048、總像素 4,194,304、輸入／輸出各 4 MiB。拒絕 APNG、tRNS、PLTE、未知必要區塊及不支援的壓縮。zlib 標頭須符合標準且無預設字典；以精確列長限制解壓，核對每列 filter 0–4，再以單一新 IDAT 重新壓縮，只保留 IHDR／IDAT／IEND。

伺服器保留已驗證的濾波掃描列，不依賴 GD，也不把原壓縮資料或 ancillary 中繼資料帶入輸出；雜湊以伺服器最終 PNG 計算。原始 EXIF／IPTC／XMP、色彩描述檔和檔名均不保存。瀏覽器縮圖／解碼及色彩描述檔移除可能造成色彩差異，不能宣稱原始檔、色彩管理或典藏級影像保真。

解碼前依 `memory_limit` 與目前用量保守估計 chunk、CRC、壓縮／解壓副本和保留空間；模型編碼前另預留 raw／base64／JSON／cURL 多份副本。可用記憶體不足或無法安全確認即拒絕，可能比檔案／像素名義上限更早阻擋；不更改或關閉 memory_limit。建議縮小圖片或減少本次圖片數量，而非以取消限制繞過檢查。

### 私有儲存、原子保存與讀取

`MediaStore` 僅使用既有 Store 的同一 PDO，在原 SQLite 增建 `media_assets` 與 `media_upload_receipts` 兩表。沒有替換資料庫、改寫既有表、更新 user_version、清理舊資料或刪除歷史圖片。media_assets 是 append-only PNG BLOB，含 owner／project_id／item_id、固定 descriptor、created_at；收據以 `(owner,request_id)` 唯一，保存 fingerprint 與新 version_id，不保存原始請求、檔名、Key 或 base64。

上傳先核對 owner 的專案存在及有界 PNG，再用同一 PDO 的 `BEGIN IMMEDIATE` 原子保存資產、完整專案／版本與收據；正規化與網路工作不放進短交易。交易內重新驗 revision／active item／封存與定稿狀態、來源版本及配額，失敗整筆回滾。相同 requestId 和 fingerprint 成功重放只回傳已保存版本；內容不同拒收。網路或回應不確定時不自動重試，先讀最新狀態再由使用者明確重送同一請求。

每專案最多 100 資產／64 MiB，每 owner 最多 400 資產／256 MiB；同一圖片的純 metadata 另存沿用資產。封存版本、正式版、定稿歷史及既有固定引用保留 BLOB；沒有垃圾回收或自動騰空間，封存不釋放額度。

`readImageVersion()` 由 owner → project → item → saved version 解析 artifact，再核對資產所屬 item 和完整 descriptor、長度與 SHA-256；不能只憑客戶端提供的資產 ID 讀取。讀取不因來源已封存／定稿而改用新版本，固定引用解析其確切舊版本。手動 snapshot 也必須有已保存來源，而且 asset descriptor 與來源完全相同；只能改 title／alt／attribution 及版本目標，不能換 BLOB 或引用別人的圖片。

`public/media.php` 不提供 GET 圖片網址。上傳與讀取都是同 Origin、Session／owner 及 X-CSRF-Token 的 POST，維持本機 Host／proxy 限制與 no-store／nosniff，另有 Cross-Origin-Resource-Policy: same-origin。multipart 只接受一個 PNG（最多 4 MiB）及最多 32 KiB JSON payload，整體 body 上限 4,325,376 bytes；PHP upload_max_filesize 至少 4M、post_max_size 至少 5M。read_image 的 JSON 最多 64 KiB，只帶專案／項目／版本 ID，不接受任意 URL 或路徑。主 `api.php` JSON 上限仍為 1 MiB，沒有放寬成圖片通道。

只有頂端正式版自動請求預覽；候選、歷史、引用及比較使用明確「載入此圖片預覽」按鈕，避免一頁載入所有歷史 BLOB。未載入時仍可閱讀 metadata；過期／重複事件不觸發新讀取。預覽由核准來源 POST 取得 PNG Blob，使用短暫 object URL；重畫、關閉或錯誤時 revoke，過期回應不能把舊圖片放入新工作區。工作室 CSP 僅在 img-src 增加 blob: 供這類本機預覽，其值為既有 self／data: 加上 blob:；其餘指令不放寬，也不新增任意外部圖片、腳本或 iframe 執行來源。應用程式仍不接受作者指定圖片 URL／data URL。瀏覽器 Blob URL 不是公開分享連結。

### 固定模型與實際輸入來源

`grant_image_analysis` 只在可編輯圖片項目核對固定模型後保存專案層 `{bindingHash,acceptedAt}`，不取 Key、不推論。bindingHash 綁定完整既有 aiBinding；普通 usageConsent 仍必要，不能把圖片上傳當作同意送給模型。確認後使用者明確送出討論／整理方向／比較便執行，不新增逐次確認視窗。模型必須同時支援視覺與所需結構化輸出；模型清單與文字成功都不是此能力的驗收，失敗不換模型、服務或以描述代替像素。

圖片模組的討論／整理方向由選定已保存來源（未指定時依既有正式版規則）與固定圖片引用建立輸入；比較只提供明確所選 2–5 版的圖片，不包含 pinned references 的像素。文字脈絡仍可保留固定引用，因此提示明確區分「文字來源存在」與「本次確實提供像素」。其他模組不因圖片引用而自動傳送圖片像素。圖文／海報的本機預覽與明確 HTML 匯出可讀取固定圖片，但其 AI 排版請求仍只有中繼資料；網頁尚不嵌入圖片。

每次最多 5 個不同 asset ID、原始 PNG 合計最多 12 MiB；同資產只傳一次但保留每個版本與標籤對應。所有圖片先依確切已保存 owner／project／item／version 解析，核對 BLOB/hash，沒有 URL 載入。`imageInputSnapshots` 在結果 provenance 保存 itemId、versionId、assetId、sha256、label 與 inputMode=image_bytes，不保存圖片本體；每次請求先清空，模組 ask 消耗一次後清除，包含錯誤路徑，避免下一次沿用圖片。

`generate(...,maxOutputTokens,images)` 的 images 是經驗證的 in-memory 位元組、assetId、SHA-256 與標籤。OpenAI 只由伺服器把這些位元組編成 Responses input_image data URL；Ollama 只編成最後一則 user message 的 images base64 陣列。這是內部供應者 payload，不是允許使用者輸入外部 URL／data URL。目的地仍是專案固定服務，不落地 base64，也不寫入對話、專案 JSON、日誌或匯出。

`ImageModule` 可以具體討論可見構圖、色彩、文字與用途，也必須承認看不清的內容；圖片內文字、版本描述與引用均為不可信資料。指定來源分析永遠回 clarification，不產生 revision；compare 要求每個選定來源都有實際像素。生成／融合直接拒絕，不呼叫圖片生成服務、不以 SVG／文字／占位圖冒充成果。回覆的假完成用語亦有檢查，但不等於保證模型視覺判讀或語意正確。

### 匯出與示範

已保存版本可個別下載最終 PNG 或匯出單件 metadata JSON；單件 JSON 不含歷史，專案 JSON 另保存完整 metadata／歷史／來源，不內嵌 PNG，不是完整圖片備份，也沒有還原／匯入完整媒體的介面。完整離線備份須在程式停止寫入時保存整個私有資料夾（包括 SQLite 及可能存在的 journal／WAL 檔）與 config.local.php；內含 Session／暫存 Key 時須按敏感資料保管，不分享。

固定腳本示範不開放圖片上傳、私人圖片讀取或真正圖片分析，不使用假圖片或固定描述冒充看圖。圖文與海報已在本機版啟用；離線腳本未提供這兩類示範。互動視覺程式仍未啟用。

## 原生圖文／海報契約

`CompositionModule` 沿用專案固定文字／結構化模型，`illustrated`／`poster` 各次生成恰一份完整 artifact，不生成圖片像素、不新增圖片 provider。原件接受精確欄位、真正物件／密集陣列與純文字；不接受 HTML、CSS、JS、SVG、圖片位元組、URL、路徑或任意額外欄位代替原件。

- illustrated 精確為 `{kind:"illustrated",title,theme,blocks}`；theme 為 paper／night／meadow。1–24 區塊，每個精確為 `{id,heading,body,layout,imageRefId,caption}`；body 非空，最多 12,000 bytes；heading／caption 可空，各最多 600 bytes。layout 僅 text／above／left／right；text 必須空 imageRefId，其餘必須有固定圖片引用。
- poster 精確為 `{kind:"poster",title,format,theme,blocks}`；format 為 portrait／square／landscape，theme 為 paper／night／festival。2–16 區塊且至少一個 headline 加一個 text 或 image；每個精確為 `{id,type,text,imageRefId,alignment}`。type 為 headline／text／image，alignment 為 left／center／right；前兩者文字非空、最多 2,000 bytes 且 imageRefId 空；image 必須有引用，text 為可空圖說、最多 600 bytes。
- 兩類 title 非空且最多 600 bytes。區塊 ID 全件唯一，ASCII 英數開頭，只含英數／底線／連字號，最多 64 字元；原文字、空白及換行保留。imageRefId 為空字串或 32 位小寫十六進位引用 ID，不是 assetId、versionId、URL 或授權憑證。完整正規 artifact JSON 最多 60,000 UTF-8 bytes，超限整筆拒收；`compositionItems()` 從原件產生固定 `document／圖文來源` 或 `document／海報來源` 的完整 JSON 投影，不接受摘要代替作品。

### 海報三部分方向與模型邊界

海報 brief.tone／message／constraints 分別是「視覺風格」「完整文字內容」「圖文排列」。`confirm_generate`／相容 `approve_goal` 須送精確有序 `confirmedDirections=["style","text","layout"]`，整數 `directionRevision` 必須等於當前 summaryRevision。勾選只是頁面暫態，不推論、不建作品；新方向使舊確認失效，通過後才由明確生成操作呼叫模型。確認文字及 revision 保存在 directionConfirmation，不能與網頁 `["style","content","functions"]` 混用。

模型只收圖片標題、替代文字、來源註記、width／height／mime、固定來源 ID 與 `pixelsProvided:false`；整體另標 `imagePixelsProvided:false`。allowlist 不傳 asset descriptor、raw／base64、data URL、路徑或 transport 附件。來源驗證可在伺服器讀取私人 PNG，但該讀取不等於模型收到像素；只有 image 模組及其另行明確同意的分析流程可傳實際像素。沒有可用圖片仍可產生純文字排版，不能捏造圖片、網址或占位資產。

模型說明中的明顯「已看見／檢視圖片」假宣稱有有界文字拒收檢查（MODEL_PIXEL_CLAIM），不改寫作品本文，也不是完整語意、視覺品質或所有語言的保證；未測試真實 API 遵循率。完整模型回覆另限 90,000 bytes，生成／修訂／融合請求 24,000 output tokens，比較 6,000，不保證能產出最大作品。

### 固定引用、完整歷史與預先授權核對

`compositionReferencePool()` 先合併所選來源版本 referencesSnapshot 與目前引用。引用須屬目前專案，targetItemId／versionId 及快照 ID 一致；經目前 owner 的專案定位確切已保存項目／版本，圖片 artifact 必須等於保存版本，並以既有私人媒體路徑核對資產、descriptor、長度與 SHA-256。這是推論／保存前的程式核對，不另要求使用者逐次彈窗。模型回傳的 metadata 或合法形狀本身不授權讀取。

同一引用 ID 出現不同 targetItemId、versionId 或完整快照即 COMPOSITION_REFERENCE_CONFLICT，停止推論／保存；前端也阻擋這種來源的編輯器，不任選一方。跨 owner／專案／項目、缺失／變造圖片資產與來源型別不符均拒絕，不換成最新版本。來源封存不改原固定快照；新加入引用仍須走既有明確、未封存來源流程。合併參考池最多 256 筆，超限不截斷。

生成、手動主／小版、AI 修訂與融合的新 referencesSnapshot 保存「目前全部引用＋結果實際使用但目前已移除的歷史圖片引用」，不持續累積未使用祖先。比較保留目前及全部所選來源的引用聯集，讓每版可追溯各自固定圖片。舊來源、舊正式版與定稿不可變；預覽／單版匯出只讀該保存版本 referencesSnapshot，不能借用目前引用補缺漏。

修訂以完整已保存 artifact 為唯一起點，不讀頁面草稿、不接受文章選段。釐清須回傳完全相同原件後捨棄，不存假版本；實際修訂另存完整小版及本版目標，只有目標改變時 artifact 必須原樣。內容指紋忽略單純區塊 ID 改名及同一圖片版本的引用別名，不能以這些變動冒充修訂。比較與融合明確選 2–5 版，依各版自己的目標；融合另存一個完整新主版，拒絕照抄任一來源指紋，不自動採用，也不是圖片像素融合。

### 草稿、預覽與本機檔案匯出

編輯器分開作品設定欄位、逐區塊欄位與已套用草稿。須明確套用或放棄未套用欄位，才可新增／移除／上下移動區塊或外層另存。既有區塊 ID 保留，新區塊用新 ID；不允許破壞海報至少一標題與一內容的結構。欄位可跨同頁區塊切換／busy 重畫／重新讀狀態保留，過期回呼不能修改新來源；整頁重整或關閉不保存草稿，沒有 composition 復原堆疊。保存都是完整主／小版，不覆寫來源或正式版。

固定 DOM／scoped CSS 只顯示純文字與已驗證私人圖片，無 innerHTML／iframe 執行作者程式。night 使用專屬亮文字、圖說及私人圖片說明樣式，但數值／來源檢查不等於全頁無障礙實測。海報畫幅是可延展預覽，不承諾固定印刷尺寸或單頁列印。頂端正式版可自動讀圖；候選／歷史／比較需明確載入排版圖片，編輯草稿另有明確載入按鈕。

`exportCompositionHtml()` 只處理已保存版本及其確切引用，藉 caller 的既有授權 POST 讀取 PNG。先按每個區塊的內嵌次數累加 raw PNG，總量最多 20 MiB，每張最多 4 MiB；同圖重複可去重讀取但不可少算內嵌容量，HTML 因 base64 與文字可更大。前置核對重複／缺失引用、snapshot.id、完整 image artifact；讀取後核對 Blob MIME、長度、PNG 標頭／尺寸與 SHA-256。每次 await 前後核對當前渲染狀態，缺圖、改動、讀取失敗、取消或 stale 均整筆拒絕，未完成不建立下載，不產生部分缺圖成品。

HTML 僅含固定 CSS、安全跳脫完整文字及程式內部建立的 `data:image/png;base64,`。早期 CSP 使用 default-src none、img-src data:、固定 style-src unsafe-inline，禁用 script／connect／object／frame／base／form；沒有腳本、外部 URL／網路請求或表單。匯出準備仍需讀取本機私人媒體，不等於輸出的 HTML 會連線，也不改主頁 CSP。JSON 是 `{notice,artifact}`，只含可編輯排版與引用 ID；TXT 是警語與完整文字投影，不含圖片或視覺排版。兩者不含引用來源完整快照，HTML 也不是完整專案備份；沒有檔案匯入／自動還原介面。離線固定腳本不支援圖文／海報，不拿假結果代替真實能力。

## API、請求保護與錯誤

GET `state` 回傳 CSRF、非秘密設定、Key 狀態、專案清單及模組登錄；GET `project&id=...` 回完整專案投影，不推論。主 JSON API 的 POST 僅接受同 Origin、正確 X-CSRF-Token、application/json；操作名稱從 JSON `body.action` 解析。HTTP body 上限 1 MiB（1,048,576 bytes），超限 413。

專案寫入須符合 revision，項目操作須符合 active item。設定寫入及綁定帶 expectedSettingsRevision，舊分頁不得覆寫。推論操作 discuss／summarize／generate／confirm_generate／compare／fuse 帶 consent、approvedMemberId、approvedProvider、approvedModel、approvedSettingsRevision、requestId，OpenAI 另帶 approvedKeyRevision；這些是請求一致性檢查，不是逐次確認視窗。

requestId 與請求 fingerprint 防重放；成功重放讀取目前專案，失敗／執行中不重複推論。日誌不保存原始請求或 Key。`error.operationOutcome` 區分 rejected 和 unknown；確定格式拒收不保存有效結果，但可能已計費，斷線／逾時等不確定結果先讀最新狀態。無自動重試、換服務或示範 fallback。

## Provider 與容量界線

OpenAI 固定 HTTPS `/v1/responses`、Responses JSON Schema、store=false、stream=false；Ollama 固定 PHP 同機 loopback HTTP `/api/chat`、JSON Schema、非串流。兩家 `generate(model,messages,schema,maxOutputTokens,images=array())` 接受 6,000–24,000 output tokens，預設 6,000；長文與原生作品路徑要求較大預算，並不保證實際模型的可用性、格式、字數或完成度。截斷／未完成及不合 schema 的輸出拒收。

`list_models`／test_connection 僅由明確操作讀取 OpenAI 模型中繼資訊或 Ollama `/api/tags`，不推論、不下載、不編造清單。模型可見與結構化生成成功是不同驗證。

內容限制皆為 UTF-8 bytes：

- titles：1–12 項，每項 6,000、合計 24,000。
- short_text：固定 body／全文 1 項，12,000；生成恰 3 篇。
- article：1–80 段，每段 6,000、保存全文合計 120,000；生成恰 1 篇，單次生成／融合正文最多 36,000。融合前各來源文章也須不超過 36,000。修訂所選來源段落合計最多 24,000，回傳選段合計上限為 min(36,000, 120,000 − 未選段落 bytes)，此剩餘容量同時傳給模型並在合併前驗證，再驗證完整合併全文。
- table：1–12 欄、1–100 列；caption 600、欄名 120、每格 2,000 bytes；完整 artifact JSON 及相容文字投影各最多 60,000 bytes，總上限優先於單格上限。
- chart：title 600、xLabel／yLabel 各 120、sourceText 12,000 bytes；完整 artifact JSON 及投影各最多 60,000。流程節點文字 1–240、連線標籤 0–120 bytes；統計標頭／分類名稱各 1–120 bytes。生成／修訂／融合請求 24,000 output tokens，不保證可裝入最大作品；不完整輸出拒收，不截短。
- mindmap：1–80 個 nodes、0–24 個 proposals；各 label 240、description 2,000 bytes；完整 artifact JSON 與文字投影各最多 60,000。初次 1 個根與 2–12 個待選分支；子分支修訂若有待選變動，目標集合為 2–12 個，仍受全圖總量限制。生成／修訂／融合請求 24,000 output tokens，不保證完整產出最大作品。
- vector：1–100 個 shapes，整數畫布 1–4096；title 600、label 120、text 4,000 bytes，最多 80 個局部頂點。原生 artifact JSON 與精確緊湊投影各最多 60,000 bytes，數值最多三位小數；具體幾何及伺服器序列化差異見上節。生成／修訂／融合請求 24,000 output tokens，不保證產出最大作品。
- webpage：1–20 區塊，cards／faq 每區 1–12 條目；網頁／區塊／條目標題 600、眉標／按鈕文字 240、區塊內文 12,000、條目內文 6,000 bytes。完整正規 JSON 與投影各最多 60,000 bytes，總量包含欄位結構與跳脫字元；生成／修訂／融合請求 24,000 output tokens，不保證完整產出最大作品。
- illustrated／poster：完整 JSON／投影最多 60,000 bytes；圖文 1–24、海報 2–16 區塊，title 600，圖文 heading／caption 600、body 12,000，海報文字 2,000、圖說 600 bytes；具體結構與含圖 HTML 配額見上節。
- image：title 600、alt 3,000、attribution 2,000 bytes；PNG、傳輸、儲存及分析配額依圖片契約，像素不計入專案 JSON 本體。
- 本版合併意見 12,000；版本 goalText 6,000；對談輸入 4,000；比較／融合問題及生成方向 2,000。其他結構欄位另有限制，不因合併輸入而解除。
- 序列化模型資料上限：titles 240,000，short_text／article／table／chart／mindmap／vector／webpage／image／illustrated／poster 600,000；全文及歷史不默默截斷。短文／文章／表格／圖表／心智圖／向量圖形／網頁／圖文／海報模組以版本索引代替未選取的歷史全文，但保留對話與固定引用，選取修訂／比較／融合時帶完整來源。
- 每 owner 最多 100 專案，每專案 30 項目（含封存），每項目 60 版本（含封存）、60 比較、60 輪討論、400 則訊息、12 筆固定引用。專案序列化內容最多 2,000,000 bytes。

推論前按操作保守預留完整結果、引用、來源快照與 JSON 跳脫空間，接近容量可提前拒絕，即使名義版本數尚未滿；不保證磁碟或 SQLite 故障時可保存。資料保存上限、HTTP 限制、模型脈絡及 output tokens 是不同界線，不能互相當作可生成長度保證。

## 介面與安全維持

正式版完整內容置頂，其後 01 對談、02 主軸與方向、03 候選；版本樹用可收合主版組及完整內容，顯示 minor、basedOnVersionId 及融合多來源。文章選段範圍與完整手動編輯分開。正式版捲動 region 可鍵盤聚焦，列印取消高度限制；展開／閱讀位置僅頁面暫存，不修改作品。

結構化單選 2–6 答案，ID 最多 64、label 120、value 1,000 bytes；只接受最新 assistant discussion／clarification。choiceContext 綁定項目、正式版、共同脈絡、項目名稱／說明、baseVersionId 及 targetItemIds，心智圖指定來源另綁定 targetNodeId；伺服器解析已保存答案並核對 input.text，失效或篡改於推論前拒絕。按鈕以 textContent 顯示，不清除文字草稿，不從舊 prose 補造選項。

本機限定、同源／CSRF、私有資料與 Session／Key 位於 Web root 外的邊界不變。Key 最長 30 分鐘，不進 SQLite、設定或匯出。前端快取標籤為 `20261021-version14`；同系列更新保留 config.local.php、私有資料、原 Cookie／Session 及仍有效暫存 Key，不重新安裝或重設資料庫。來源檢查不等於 PHP／Apache／XAMPP／瀏覽器或真實模型驗收；開發檢查命令見 [README](../README.md)。
