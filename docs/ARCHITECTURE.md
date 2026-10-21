# AI共創工作室架構與開發契約

## 模組與目錄

- `public/`：本機瀏覽器入口、一次性 HTTP 安裝、同源 JSON API、ES module UI 與明確標示的固定腳本示範。
- `app/app.php`：專案／項目狀態、固定模型綁定、操作路由、不可覆寫快照、容量預留。
- `app/modules/titles.php`：標題名稱的討論、方向、生成、指定來源修訂、比較及融合契約。
- `app/modules/text.php`：沿用上述流程的短文／長篇文章，另實作全文、段落範圍及長度驗證。
- `app/content.php`：各類型內容／段落定義及完整內容限制；驗證不默默截斷正文。
- `app/versioning.php`：主／小版本、舊版讀取、封存、合併目標與比較快照。
- `app/members.php`、`model.php`、`ollama.php`：非秘密成員設定及兩家 provider adapters。
- `tests/`：來源契約、前端／示範、SQLite、PHP fixture；`phase1.php` 覆蓋第一階段流程。本次缺少原生 PHP，未執行 PHP fixture。

`moduleRegistry()` 的固定順序為 `titles` 標題名稱、`short_text` 短文、`article` 長篇文章、`illustrated` 圖文、`table` 表格、`chart` 圖表、`mindmap` 心智圖、`vector` 向量圖形、`image` 圖片創作、`poster` 海報設計、`webpage` 網頁、`interactive` 互動視覺程式。僅前三個 enabled；後九個保留規劃／引用，沒有生成、比較、融合或定稿能力，不以文字替代媒體生成。

## 正規資料與相容讀取

SQLite `projects.body` 保存專案：`id`、`title`、`description`、`aiBinding`、`projectLifecycle`、`revision`、`sharedContextRevision`、`activeItemId`、`creativeItems`、`projectFinalizations`。

每個 creative item 各自有類型、名稱、說明、封存狀態、phase／lifecycle、messages、brief、versions、officialVersionId、comparisons、finalizations、references 與 contextRevision。API 加上 activeItem 並把選取項目的工作欄位投影到頂層；頂層 id／title／description／revision 仍是專案，不得把投影寫成第二份持久內容。

`normalizeRaw()` 將缺少的 `aiBinding` 讀為 null，不能從現行中央設定或舊 provenance 推測綁定。項目 enabled 依現在登錄重算，因此舊 `article` 可開始使用文章模組，原訊息、版本、定稿、引用不因此重寫。舊版本 `number=n` 讀為主版 Vn，保留 ID、內容與實際來源；缺少的歷史資訊不補造。

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

phase 為 discussion → summary → ready → work；項目及專案 lifecycle 各自為 created → in_progress → finalized。相關共同脈絡變動會使方向確認失效。新批次生成及定稿須有效方向；指定既有版本修訂、來源版本手動另存、比較及融合不藉此強迫重走初次構思，也不假造確認。只有明確 reopen 才解除定稿／結案，過往快照保留。

## 指定來源修訂與完整快照

`discuss.baseVersionId` 指定目前項目的未封存來源；省略時相容地使用 officialVersionId，沒有來源才走初次討論。候選不需先 promote。來源、revision、itemId、唯讀狀態與容量均先驗證，不允許借用另一項目版本。

- 標題名稱修訂回傳完整 items，保留既有 id／label；只在明確要求下新增內容欄位，刪除／改名應改用手動編輯。
- 短文固定一項 `{id:"body",label:"全文",content:...}`，修訂保存完整全文，不接受段落 targets。
- 長篇文章必須明確提供非空、無重複且屬於來源的 `targetItemIds`，不預設全選。模型取得完整 `sourceVersion.items` 及目標；schema 與伺服器限制它只回傳選取段落，id／label 必須保持。未選段落沿來源原陣列逐位元組保存，保持順序，再與選段合併為完整新文章並重新驗證。
- AI 選段不可新增、刪除、改名或重排段落；手動 snapshot 可改結構，保存完整新版、既有 ID 與新段落新 ID，來源仍不變。

`outcome=revision` 必須有實際內容或本版目標差異、完整可審閱內容與 metadata，question／choices 為空。追加來源 major 的下一 minor，保存 basedOnVersionId、revisionInstruction、targetItemIds、provenance 及來源對話。`outcome=clarification` 必須 items=[]，不建立假版本；有界說明 metadata 驗證後丟棄。多問、明顯假稱修改完成或畸形輸出拒收；有界文字檢查不是完整語意理解保證。

每版是不可覆寫的 `items:[{id,label,content}]` 完整快照，不只保存差異。`id` 是識別碼；`major`／`minor` 是整數，V5.10 不是浮點數。主版取目前最大 major+1；小版取來源 major 下最大 minor+1，封存版也計入。`basedOnVersionId` 指實際來源，不以相鄰版號推測。

`goalAndRationale` 為單一、非空、最多 12,000 UTF-8 bytes 的本版目標與修改意見；有此欄位就優先使用。舊 goalText／goalSnapshot／changeSummary／rationale 留作相容歷史，缺合併欄時才組合不同既有文字，不重寫舊快照或捏造紀錄。AI metadata 取自同一次回覆，手動輸入驗證後保留，不猜測拆分。

只有 `promote` 改 officialVersionId；只有 `titles` 同步更改 creative item 名稱，不更改短文／文章項目名或專案 title／description。主名稱優先明確中文／主要標籤，再名稱／標題，最後第一項；導覽名稱最多取 59 個 Unicode code points 加省略號，正文不截短。生成、融合、修訂或手動另存不自動 promote。

## 比較、融合、引用與封存

`compare` 僅接受目前項目 2–5 個不同、未封存版本，模型取得每版完整內容與自己的目標／修改意見。逐版回傳 ID 必須完全匹配；不使用目前共同目標統一評分、不選唯一冠軍。保存 goalBasis=version_snapshots、versionGoalSnapshots、goalSnapshot=null 及 provenance；比較不修改作品。

`fuse` 是另一個明確操作及一次模型呼叫，同樣要求 2–5 個有效來源；結果是一個完整新主版候選，source=fusion、basedOnVersionId=null，保存 fusionSourceVersionIds、fusionSourceSnapshots、fusionInstruction、當次目標及採納／捨棄說明。所有來源與目前正式版不變，不由比較自動觸發。

固定引用保存來源版本完整內容及直接模型來源，下一層引用只留 ID／模型來源，避免無限遞迴複製。來源改版、封存或換正式版不改固定引用。archivedVersionIds 與不可變內容分離；正式版不得封存，封存不釋放容量。還原後才可作新修訂、比較、融合或引用來源。項目封存與版本封存互相獨立。

## API、請求保護與錯誤

GET `state` 回傳 CSRF、非秘密設定、Key 狀態、專案清單及模組登錄；GET `project&id=...` 回完整專案投影，不推論。POST 僅接受同 Origin、正確 X-CSRF-Token、application/json；操作名稱從 JSON `body.action` 解析。HTTP body 上限 1 MiB（1,048,576 bytes），超限 413。

專案寫入須符合 revision，項目操作須符合 active item。設定寫入及綁定帶 expectedSettingsRevision，舊分頁不得覆寫。推論操作 discuss／summarize／generate／confirm_generate／compare／fuse 帶 consent、approvedMemberId、approvedProvider、approvedModel、approvedSettingsRevision、requestId，OpenAI 另帶 approvedKeyRevision；這些是請求一致性檢查，不是逐次確認視窗。

requestId 與請求 fingerprint 防重放；成功重放讀取目前專案，失敗／執行中不重複推論。日誌不保存原始請求或 Key。`error.operationOutcome` 區分 rejected 和 unknown；確定格式拒收不保存有效結果，但可能已計費，斷線／逾時等不確定結果先讀最新狀態。無自動重試、換服務或示範 fallback。

## Provider 與容量界線

OpenAI 固定 HTTPS `/v1/responses`、Responses JSON Schema、store=false、stream=false；Ollama 固定 PHP 同機 loopback HTTP `/api/chat`、JSON Schema、非串流。兩家 `generate(model,messages,schema,maxOutputTokens)` 接受 6,000–24,000 output tokens，預設 6,000；長文路徑要求較大預算，並不保證實際模型的可用性、格式、字數或完成度。截斷／未完成及不合 schema 的輸出拒收。

`list_models`／test_connection 僅由明確操作讀取 OpenAI 模型中繼資訊或 Ollama `/api/tags`，不推論、不下載、不編造清單。模型可見與結構化生成成功是不同驗證。

內容限制皆為 UTF-8 bytes：

- titles：1–12 項，每項 6,000、合計 24,000。
- short_text：固定 body／全文 1 項，12,000；生成恰 3 篇。
- article：1–80 段，每段 6,000、保存全文合計 120,000；生成恰 1 篇，單次生成／融合正文最多 36,000。融合前各來源文章也須不超過 36,000。修訂所選來源段落合計最多 24,000，回傳選段合計上限為 min(36,000, 120,000 − 未選段落 bytes)，此剩餘容量同時傳給模型並在合併前驗證，再驗證完整合併全文。
- 本版合併意見 12,000；版本 goalText 6,000；對談輸入 4,000；比較／融合問題及生成方向 2,000。其他結構欄位另有限制，不因合併輸入而解除。
- 序列化模型資料上限：titles 240,000，short_text／article 600,000；全文及歷史不默默截斷。文字模組以版本索引代替未選取的歷史全文，但保留對話與固定引用，選取修訂／比較／融合時帶完整來源。
- 每 owner 最多 100 專案，每專案 30 項目（含封存），每項目 60 版本（含封存）、60 比較、60 輪討論、400 則訊息、12 筆固定引用。專案序列化內容最多 2,000,000 bytes。

推論前按操作保守預留完整結果、引用、來源快照與 JSON 跳脫空間，接近容量可提前拒絕，即使名義版本數尚未滿；不保證磁碟或 SQLite 故障時可保存。資料保存上限、HTTP 限制、模型脈絡及 output tokens 是不同界線，不能互相當作可生成長度保證。

## 介面與安全維持

正式版完整內容置頂，其後 01 對談、02 主軸與方向、03 候選；版本樹用可收合主版組及完整內容，顯示 minor、basedOnVersionId 及融合多來源。文章選段範圍與完整手動編輯分開。正式版捲動 region 可鍵盤聚焦，列印取消高度限制；展開／閱讀位置僅頁面暫存，不修改作品。

結構化單選 2–6 答案，ID 最多 64、label 120、value 1,000 bytes；只接受最新 assistant discussion／clarification。choiceContext 綁定項目、正式版、共同脈絡、項目名稱／說明、baseVersionId 及 targetItemIds；伺服器解析已保存答案並核對 input.text，失效或篡改於推論前拒絕。按鈕以 textContent 顯示，不清除文字草稿，不從舊 prose 補造選項。

本機限定、同源／CSRF、私有資料與 Session／Key 位於 Web root 外的邊界不變。Key 最長 30 分鐘，不進 SQLite、設定或匯出。前端快取標籤為 `20261021-version8`；同系列更新保留 config.local.php、私有資料、原 Cookie／Session，不重新安裝或重設資料庫。來源檢查不等於 PHP／Apache／XAMPP／瀏覽器或真實模型驗收；開發檢查命令見 [README](../README.md)。
