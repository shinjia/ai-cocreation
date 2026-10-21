# 架構與開發契約

## 目錄與範圍

- `public/`：瀏覽器入口、一次性 HTTP 安裝、同源 JSON API、ES module UI、明確標示的固定腳本示範。
- `app/`：驗證、設定、Session、暫存 Key vault、SQLite、專案／創作項目狀態機、provider adapters。
- `app/modules/titles.php`：「標題名稱」的討論、目標整理、候選組、正式版修訂及比較規格。
- `app/versioning.php`：主／小版本座標、舊版相容讀取、封存狀態與比較快照。
- `app/members.php`：非秘密 AI 成員清單與使用同意的驗證。
- `app/modules.php`：創作類型能力登錄。目前 titles 啟用，其他類型只有規劃位置。
- `tests/`：來源契約、前端／示範、SQL 及 PHP 原生 fixture。本次環境未執行 PHP fixture，詳見測試報告。

公開原始碼的目標儲存庫為 [shinjia/ai-cocreation](https://github.com/shinjia/ai-cocreation)；應用仍只供 PHP 主機本機使用，不是公開部署。

## 正規資料與投影

SQLite `projects.body` 保存專案：id、title、description、projectLifecycle、revision、sharedContextRevision、activeItemId、creativeItems、projectFinalizations。

每個 creative item 自有 id、type、title、description、enabled、archived、phase、lifecycle、messages、brief、versions、archivedVersionIds、officialVersionId、comparisons、finalizations、references、contextRevision。專案可有多個創作項目；移除的只是內容編輯工作區內巢狀「新增內容項目」入口，不是專案層的 create_item。

API 為便於單工作區顯示，回傳專案加上 activeItem，並將選取項目的 phase/lifecycle/messages/versions 等投影到頂層；**頂層 id/title/description/revision 仍是專案資料**。寫回時只更新選取的 creativeItems 成員，不把投影複製成第二份持久內容。`projectLifecycle` 與頂層投影的 `lifecycle` 分別代表專案和選取項目。

## 完整版本、來源與封存

版本的 `items:[{id,label,content}]` 是一套具名文字，不是專案下的創作項目。所有既有欄位均保留；按鈕以全部內容新增快照，不逐欄覆寫原版。

- `id` 為穩定識別碼，不能用顯示版號代替。`number` 保留原本追加序號；`major`、`minor` 為整數，V5.10 不是浮點數。
- 每個創作項目獨立編號。`versionMode=major` 取該項目所有版本的最大 major + 1、minor=0；`versionMode=minor` 必須有來源，沿來源 major 取同主版號最大 minor + 1。封存版本也參與編號，不重用版號。
- 完整另存與小修改都追加完整版本，保存 `basedOnVersionId`；這個 ID 指向實際選取的來源，不以版號猜測關係。主版本不表示沒有來源，小版本也不表示只保存差異。
- 舊版 `number=n` 正常對應主版本 Vn，不重建 ID、內容或來源。舊資料未保存的目標、修改摘要、成員資料及對話連結不事後捏造。
- `archivedVersionIds` 位於創作項目層，與不可覆寫的版本內容分離。封存／還原只改此清單；正式版不可封存。封存不刪除、不釋放 60 版本額度，既有比較與固定引用不被改寫。
- 封存版本不能作為新的手動來源、正式版、新比較或新引用，還原後可重新使用。`restore_version` 在 400 則訊息門檻下仍可執行且不再追加對話；其他定稿／結案／項目唯讀限制仍適用。

工作區步驟為「04 選擇與微調」、標題為「編輯創作內容」，只保留一個「本版目標與修改意見」輸入框。新版本的 `goalAndRationale` 為非空、最多 12,000 UTF-8 bytes 的完整文字，是本版修訂／比較的主要依據，不拆回兩個輸入欄。

每版仍保存 `goalText`、`goalSnapshot.summary`、`goalSource`、`changeSummary`、`rationale`、`discussionMessageIds`、`messageId`、`referencesSnapshot`、`projectContextSnapshot`、`provenance`、`createdAt`。已有 `goalAndRationale` 時，舊分欄只作相容歷史，不得蓋過或重複計算合併內容。手動 snapshot 保存合併文字時，驗證後保留原文字與前後空白，不猜測如何拆分目標與意見，來源的 goalText／changeSummary／rationale 保留為相容欄位；來源快照完全不改。

舊版尚無合併欄位時，`versionGoalAndRationale` 依 goalText（再退回原 goalSnapshot.summary）、changeSummary、rationale 組合不同的既有文字，只去掉完全相同的重複值與空值，不截斷或重新摘要，也不修改舊資料。已有合併欄位就直接使用，反覆編輯／另存不再次拼接標籤。沒有任何記錄就明示缺少，不向舊版填入現在的共用目標。

AI 候選／修訂仍在原本同一次結構化回覆取得 goalText、changeSummary 與 rationale，再由程式組合 goalAndRationale，**沒有額外摘要推論**。手動保存前可在單欄改寫；保存之後只能另存新版本，不修改舊版內容或中繼資料。

## 狀態與目標門檻

項目 phase：discussion → summary → ready → work。創作目標確認與 AI 使用同意是兩件事。初次構思的新對話或相關脈絡變動使目標確認失效；已有正式版的日常修訂／釐清不自動清除確認。

項目 lifecycle：created → in_progress → finalized。明確 reopen 才離開 finalized，保留 finalizations。

專案 projectLifecycle：created → in_progress → finalized。finalize_project 要求所有未封存項目均已定稿且共享脈絡未過期；reopen_project 保留專案定稿快照，不擅自把每個項目也重新開啟。

新一批 generate 與 finalize 仍需目前目標確認。已有正式版時 discuss 修訂與手動 snapshot 不依賴重新確認。compare 依所選各版本自己的快照，不依賴目前 goalApprovedAt，也不把比較操作視為確認目標。所有操作仍遵守項目、專案、封存及容量限制。

## API

GET `state` 回傳 CSRF、AI 成員設定與所選成員、使用同意、最近模型輸入紀錄、Key 狀態（不含 Key）、專案清單及能力登錄。GET `project&id=...` 回傳完整專案／工作區投影。取得 state 不查詢模型清單，不呼叫推論。

POST 需 JSON body.action、同源 Origin 與 X-CSRF-Token；URL query 不能取代 body.action。原始 JSON body 上限 **256 KiB（262,144 bytes）**，只為容納完整快照與欄位提供有界空間，不放寬逐欄內容限制。

- 系統：save_members、select_member、list_models、set_key、clear_key、test_connection；save_settings 保留舊設定路徑相容性。
- 專案：new、edit_project、finalize_project、reopen_project。
- 項目：create_item、select_item、edit_item、archive_item、restore_item。
- 引用：attach_reference、remove_reference。
- 創作：discuss、summarize、approve_goal、generate、snapshot、promote、archive_version、restore_version、compare、finalize、reopen。

除新增／系統設定外都帶專案 id/revision；創作與引用動作帶 itemId，後端必須等於 activeItemId。任何舊 revision／錯項目不覆寫資料。

明確按 AI 操作按鈕後，discuss/summarize/generate/compare 帶 consent、approvedMemberId、approvedProvider、approvedModel、approvedSettingsRevision、requestId；OpenAI 另帶 approvedKeyRevision。這些是請求一致性檢查，不是逐次彈窗。後端仍驗證所選成員已啟用、已保存 usageConsent，且服務、模型、設定代次及金鑰代次未在途中改變。

成員設定保存與選擇帶 expectedSettingsRevision，避免舊分頁覆蓋較新的設定；衝突需重新載入並核對草稿，不自動重送。

API error.operationOutcome 區分 rejected 與 unknown。明確的回覆驗證拒收為 rejected：沒有保存有效結果，但服務仍可能已計費，不應顯示「結果未知」。連線中斷、逾時、一般內部錯誤與 REQUEST_ALREADY_ATTEMPTED 維持 unknown；前端先查最新狀態。舊伺服器未提供分類時，5xx 保守視為未知。

失敗／執行中的 requestId 不重複呼叫，成功重放只讀回目前專案。儲存的請求日誌沒有原始請求或 Key。未知結果先讀最新狀態，不自動重試、換人或替換示範答案。

## AI 成員與供應者

每位成員只允許 id、nickname、enabled、provider、model、ollamaUrl；清單最多 20 位，ID 與稱呼不可重複。設定按 owner 保存，包含 activeMemberId、settingsRevision、usageConsent、consentAt，不含金鑰；本次工作階段的 OpenAI 成員共用同一份暫存 Key。對話區只列出 enabled 成員；沒有已啟用且已選取的成員就阻擋推論，不挑替代成員。

舊單一連線設定初次讀取時轉成穩定 ID 的「原有設定」成員，保留服務／模型／本機網址，但 usageConsent=false、consentAt=null。使用者需在設定中明確勾選資料與費用說明。這份同意可保存，但不改變 Key 的 30 分鐘暫存規則。新增啟用成員或更換服務、網址、模型時，設定介面要求重新核對並勾選同意；只改稱呼、停用或切換已同意的成員不代表新推論。

新歷史 provenance 固定 memberId、memberNickname、provider、requestedModel、actualModel、requestedAt。停用、更名、切換成員不修改歷史；舊紀錄缺成員快照時不以現在的成員補標。服務未回報 actualModel 時保持未回報。

`list_models` 只由明確按鈕觸發：OpenAI 固定 HTTPS `/v1/models`，Ollama 固定 loopback `/api/tags`。清單來自該次服務回應，不從範例或最近輸入紀錄偽造。手動模型名稱可作為查詢無法使用時的輸入方式，但不代表已驗證可用。test_connection 也是模型中繼資訊檢查；兩者皆不推論、不下載模型。

兩個 adapter 共用 `generate(model,messages,schema)` 與 `actualModel()`；OpenAI 使用 Responses，Ollama 使用 JSON-schema chat。每次只使用所選成員，不背景呼叫、不多模型輪詢、不自動 fallback。模組在原始 JSON 上先驗證物件／陣列／字串、必要欄位、列舉與數量，再轉成 PHP 關聯陣列，避免 items:{} 被當成 []。另外驗證長度、ID／名稱、選取版本及對話規則；模型輸出驗證失敗轉為 502，不假裝成功。

## 正式版持續修訂與比較

discuss 在 officialVersionId 不為 null 時分流 TitleModule.refine；從資料庫目前正式版讀完整來源，不信任客戶端指定其他起點。明確修改回傳 revision，追加來源主版號的下一個小版本；純釐清回傳 clarification，不建立假版本。

revision 必須有完整 items，保留既有 ID 與 label，內容或本版目標有實質差異，question 為空；goalText 和 changeSummary 在同次呼叫回傳。新增欄位只依使用者明確要求，再由使用者決定是否採用。clarification 必須 items 空陣列，不建立任何內容或目標修訂。提示詞要求不填修訂 metadata，但若模型填了有界說明文字，型別／長度仍驗證後丟棄，不因這種格式差異拒收。評價不必強迫追問；有追問時仍以一次一個重點引導。問號可出現在引述的作品文字裡，也不要求字串最後一字一定是問號。引述以外的明顯多問仍拒收；這是有限格式檢查，不代表理解自然語言的問題數。釐清回覆若明顯宣稱修改／採用完成，會拒收而非只加上未修改前綴；用詞檢查不是完整語意保證。

手動合併文字已覆蓋舊分欄時，無變更檢查也比較合併 metadata，避免目標回復舊值被誤拒；自由文字無法據此證明語意有變，仍要求模型只做真正修改，所有修訂待審閱採用，不增加呼叫。

修訂 source=revision，保存 basedOnVersionId、revisionInstruction 與各種快照。對應 assistant 訊息 kind=revision、含 versionIds 及相同 provenance；成功回應另有 revisionVersionId 供前端展示完整內容與差異。只有 promote 改正式版指標，並同步把目前 creative item 的 title 改為所採用版本的主要名稱；不改頂層專案 title／description 或作品完整內容。若要延續待採用結果，需先採用。修訂不把舊的 null goalApprovedAt 變成同意。

`officialItemTitle` 優先找標籤「中文名稱／中文標題／中文名／主標題／主要名稱／正式名稱」，再找「名稱／標題／title／name」，最後退回第一項內容。導覽名稱合併空白，超過 59 個 Unicode code points 時取前 59 個加省略號（最多 239 UTF-8 bytes），不截短版本內文。promotion 訊息保存 previousItemTitle 與 itemTitle；前端更新左側項目卡片及目前項目標示。generate、snapshot、未採用 revision 都不觸發項目更名。

compare 只接受目前項目 2–5 個不同且未封存的版本。模型取得各版完整內容、goalAndRationale、相容分欄、來源紀錄與本次問題；有合併文字時優先以它評估，只有缺合併欄位才依 goalText／舊 goalSnapshot、changeSummary、rationale 讀取。正式版 refine 的提示詞也優先理解合併欄位，不讓相容分欄覆蓋使用者的新方向；不以目前共用目標統一評分。缺記錄時要明示，目標不同時說明比較限制，不因較新或正式版身分自動給高評價。

比較結果必須逐一匹配所選 ID，不可重複或新增版本。保存 goalBasis=version_snapshots、versionGoalSnapshots 與本次 provenance；goalSnapshot=null 明示沒有單一共用目標。前端對數量、封存、唯讀、未知結果與 UTF-8 超限提供就地原因，後端再次驗證。

## 容量、固定引用與後續模組

每組 1–12 項，每項內容最多 6,000 UTF-8 bytes、全部內容合計最多 24,000 bytes；合併的 goalAndRationale 最多 12,000 bytes，比較問題最多 2,000 bytes。舊相容欄位與模型輸出仍各自保留既有長度驗證，不因合併輸入框而解除。UTF-8 bytes 不是中文字數。每個項目最多 60 版本（含封存）及 60 比較；每個專案序列化內容最多 2,000,000 bytes。

完整模型脈絡超過單次 240,000 bytes 時停止，不暗中截斷。推論前依各條路徑預留候選、目標、比較與引用快照空間，並計入 JSON 跳脫膨脹；接近上限可能提早拒絕，優先避免已計費才發現無法保存。此措施不能保證磁碟、SQLite 或主機故障時的寫入成功。

引用保存來源版本的完整內容與直接模型來源；來源已引用其他版本時，下一層只保留來源 ID／模型資訊，不無限遞迴複製。來源改版、封存或換正式版不改已固定引用。

未來生成器應沿用同一項目與引用契約，另補特定內容驗證、安全預覽及權限，不能直接把生成程式放進主頁執行。本包沒有提前實作那些能力。

## 回覆驗證診斷與界線

回報畫面的原錯誤是「AI 釐清回覆不得假裝修改作品，且每次只能問一個問題。」舊程式以同一條件串同時要求 items 空陣列、修訂 metadata 空字串、合計恰一個問號且 question 結尾為問號。沒有當次原始模型回覆，不能確定究竟哪一項觸發，不應把畫面錯誤直接歸因於成員切換或某個模型。

修正後型別、必要欄位、UTF-8／長度與 items 空陣列仍嚴格檢查；有界說明 metadata 只驗證後丟棄，評價可無追問，引述作品中的問號與普通結尾標點不再被當成同一格式錯誤。多問與明顯假稱完成修改有獨立錯誤碼。這些仍是有界文字檢查，不是完整語意驗證，也未經所有實際模型驗收。`tests/response-contract.php` 提供兩家 adapter 注入式 transport 的 PHP fixture，本次未執行。

## 通用創作者文案與既有資料

新介面、示範與提示詞不預設使用者身分或教育用途。成員選單是「和 AI 慢慢聊」面板內的單一控制列，位於標題後、討論紀錄與輸入表單前；不在面板外或輸入表單內重複產生，列印時隱藏。既有訊息 role=student 保留相容性，送給模型的投影改成 user，最新輸入欄位為 latestUserMessage；不修改資料庫中的歷史角色、原文或作品快照。
