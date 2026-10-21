# 架構與開發契約

## 目錄

- `public/`：瀏覽器入口、一次性HTTP安裝、同源JSON API、ES module UI、明確標示的固定腳本示範。
- `app/`：驗證、設定、Session、暫存Key vault、SQLite、專案／創作項目狀態機、provider adapters。
- `app/modules/titles.php`：「標題名稱」的討論、目標整理、候選組、比較規格。
- `app/modules.php`：創作類型能力登錄。目前 titles 啟用，其他類型只有規劃位置。
- `tests/`：來源契約、前端／示範、SQL及未在本環境執行的PHP原生fixture。

## 正規資料與投影

SQLite `projects.body` 保存專案：id、title、description、projectLifecycle、revision、sharedContextRevision、activeItemId、creativeItems、projectFinalizations。

每個 creative item 自有 id、type、title、description、enabled、archived、phase、lifecycle、messages、brief、versions、officialVersionId、comparisons、finalizations、references、contextRevision。

API為便於單工作區顯示，回傳專案加上 activeItem，並將選取項目的 phase/lifecycle/messages/versions 等投影到頂層；**頂層 id/title/description/revision 仍是專案資料**。寫回時只更新選取的 creativeItems 成員，不把投影複製成第二份持久內容。`projectLifecycle`與頂層投影的`lifecycle`分別代表專案和選取項目。

創作項目中的版本保存 `items:[{id,label,content}]`。這是內容項目，不是專案下的創作項目。每個版本另有 goalSnapshot、referencesSnapshot、projectContextSnapshot、provenance、messageId、basedOnVersionId。

## 狀態

項目 phase：discussion → summary → ready → work。目標確認與付費／推論確認分開。初次構思的新對話或相關脈絡變動使確認失效；已有正式版的修訂／釐清不自動清除確認。

項目 lifecycle：created → in_progress → finalized。明確 reopen 才離開 finalized，保留 finalizations。

專案 projectLifecycle：created → in_progress → finalized。finalize_project 要求所有未封存項目均已定稿且共享脈絡未過期；reopen_project 保留專案定稿快照，不擅自把每個項目也重新開啟。

## API

GET `state` 回傳 CSRF、服務設定、模型記錄、Key狀態（不含Key）、專案清單及能力登錄。GET `project&id=...` 回傳完整專案／工作區投影。

POST需JSON body.action、同源Origin與X-CSRF-Token；URL query不能取代body.action。

- 系統：save_settings、set_key、clear_key、test_connection。
- 專案：new、edit_project、finalize_project、reopen_project。
- 項目：create_item、select_item、edit_item、archive_item、restore_item。
- 引用：attach_reference、remove_reference。
- 創作：discuss、summarize、approve_goal、generate、snapshot、promote、compare、finalize、reopen。

除新增／系統設定外都帶專案id/revision；創作與引用動作帶itemId，後端必須等於activeItemId。任何舊revision／錯項目不覆寫資料。

discuss/summarize/generate/compare帶consent、approvedProvider、approvedModel、approvedSettingsRevision、requestId；OpenAI另帶approvedKeyRevision。失敗／執行中的requestId不重複呼叫，成功重放只讀回目前專案。儲存的請求日誌沒有原始請求或Key。

## 供應者

兩個adapter共用 `generate(model,messages,schema)` 與 `actualModel()`；OpenAI使用Responses，Ollama使用JSON-schema chat。模組再做型別、欄位、項目數、ID／名稱、選取版本及一次一問的獨立驗證。模型輸出驗證失敗轉為502，不假裝生成成功。

來源模型與設定在請求執行時固定，歷史記錄只讀不可變provenance。切換設定不重標舊結果，也不靜默改用其他服務。

未來生成器應使用同一項目與引用契約，另補特定內容驗證／安全預覽與權限，不能直接把生成程式放進主頁執行。此包沒有提前實作那些能力。

引用保存來源版本的完整內容與直接模型來源。來源本身曾引用其他版本時，下一層引用保留來源 ID／模型資訊，不無限遞迴複製文字；原專案仍保留來源版本可追溯。生成前預留候選及引用快照的儲存空間，空間不足時在呼叫AI前拒絕，不先計費再丟棄結果。完整對話／引用超過單次240KB傳送上限時同樣停止，不暗中截斷。

容量預留按每條AI路徑實際保存的引用份數計算：討論1份、整理1份、生成最多6份（5版本＋對話）、比較2份。另計目標與專案脈絡副本，並預留文字JSON跳脫最壞六倍膨脹；接近上限可能提早拒絕，優先避免付費後才發現無法保存。此措施無法保證磁碟、SQLite或主機故障時的寫入成功。

## 正式版持續修訂（修補02）

discuss在官方指標不為null時分流TitleModule.refine；從資料庫目前officialVersionId讀取完整來源，不信任客戶端傳入另一個起點。專案revision及activeItemId仍必須一致。明確定稿／封存／不支援類型仍在推論前阻擋。

一次模型呼叫的回覆為revision或clarification。revision必須有完整items、既有ID與label都保留、內容有實質差異、question為空；新增欄位僅依使用者要求，由明確採用新版本確認。clarification必須items空陣列、rationale空字串及一次一問，不建立版本。

修訂版本source=revision，basedOnVersionId固定來源，另存revisionInstruction、goalSnapshot、referencesSnapshot、projectContextSnapshot、provenance和messageId；對應assistant訊息kind=revision，含versionIds與相同provenance。成功回覆另含revisionVersionId讓前端顯示待採用區。官方指標只在使用者promote時變更。

修訂不呼叫goalRequired，也不把舊的null goalApprovedAt變成同意；有正式版時snapshot可手動另存。新一批generate、compare、finalize仍保留原目標門檻。每次修訂都以目前正式版為起點，前端明示要延續待採用修訂需先採用。

修訂預留2份引用快照（新版本與assistant訊息）、1份目標與專案脈絡，另加250KB供完整內容、回覆、理由及重複指令的JSON最壞跳脫。60版本門檻在模型呼叫前檢查。相同requestId不會再次推論；錯誤／未變更／漏項輸出不保存假結果，也不自動重試。
