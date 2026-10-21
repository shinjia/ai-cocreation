# 第七階段：固定雙模型與圖片生成測試範圍

日期：2026-10-21。此階段在既有十二類創作工具上加入獨立固定圖片模型與 OpenAI Images API 程式介接。保留固定對談模型，沒有逐次換模型、自動路由或真實付費測試。「共聊」仍不在範圍。

## 已執行檢查

- Node 聚合回歸 **892／892** 通過，0 略過。執行 production JavaScript、renderer、事件、fetch adapter 與獨立演算法；DOM、canvas、影像解碼及網路端點使用測試替身。PHP 部分僅來源契約，不是 PHP 執行。
- Python **120 項實際 SQLite** 檢查通過：原有 12、媒體 74、圖片生成原子交易／請求日誌 34。SQL 從 production DDL 與 prepared statements 取得；不是 PHP PDO 整合驗收。
- **17 份 public JavaScript** 通過 node --check。
- **72 份 PHP** 通過 Pygments 詞法／括號結構檢查。不是 PHP parser、php -l 或 PHP runtime。
- 本階段發布白名單共 **151 檔**。凍結來源、manifest、ZIP 與遠端 blob／tree 另行比對；原始碼推送不是部署或 CI 通過。

逐項執行紀錄見 [test-results.txt](test-results.txt)。第六階段的 139 檔、830 Node、86 SQLite、66 PHP／16 JS 統計僅屬舊里程碑，不能替代本次結果。

## 本次新增回歸

### 設定、介面與實際 fetch 外殼

- 新專案可明確選定固定對談及固定圖片成員，圖片不預選；中央啟用清單、服務、模型、暱稱與設定 revision 保留。
- 舊專案圖片綁定為明確一次性操作，須確認資料目的地及額外費用，不能修改原對談綁定。改名不重標舊來源；成員刪除、停用或目的地／模型改動會阻擋新生成。
- OpenAI 圖片專用 ID 不出現在對談候選；本地 Ollama 同名模型不被誤判成 OpenAI 圖片模型。支援 ID 清單不冒充帳戶可用模型清單。
- 圖片生成、重繪、融合各有明確按鈕，使用固定圖片成員的 body.action、同源 JSON、CSRF、成員／模型／設定／Key revision 與唯一 requestId。沒有第二個確認彈窗、背景呼叫或自動重試。已確認尚未傳送的記憶體／PNG 功能預檢錯誤不會被前端誤加可能已計費警告；實際上游拒收或未知結果仍保留費用提醒。
- 生成使用已確認方向；重繪明確選一版、融合明確選 2–5 版，來源不預選，不必重啟目標。合併目標／意見可留空，由後端採用已確認方向或來源自己的目標及本次指示。
- 未送出的對談、手動編輯、外部圖片副本保留；忙碌、過期 handler、草稿與不確定狀態會阻擋重複送出。引用必須逐項勾選用途，沒有自動傳送所有專案圖片。
- 成功回覆須有原項目內的 generatedVersionId 與相同 requestId。失去回覆後，先讀取狀態，才可用同一外殼查回已完成收據；即使另一分頁切換項目、定稿、金鑰過期或中央成員移除，也不會被誤當新生成。
- 圖片候選／來源標籤及下載提示區分 AI 生成、外部上傳與無法推定的既有版本；metadata-only JSON 不宣稱包含 PNG 備份。

### 圖片 API 與安全來源契約

- 精確允許六個 2／2.5 系列 ID，不使用任意 prefix 接受未知 snapshot，不自動挑選／替代模型。固定 n=1、1024×1024、quality=low、PNG、opaque、moderation=auto、stream=false。
- 無圖片用 JSON /images/generations，有明確來源圖片用 JSON /images/edits 與 images[].image_url data URL；沒有 URL 下載 fallback、multipart 混用或額外文字推論。
- 每次最多 5 張不同 PNG、合計 12 MiB，每張 4 MiB；像素僅來自精確 owner／project／item／version。重複資產只傳一次，每個來源用途以 one-based imageIndex 對應實際順序。
- 新版 referencesSnapshot 僅保存本次選用圖片及實際傳送的固定文字引用；專案原有引用不被修改，未選圖片不假裝已送出。來源完整版本、自己的目標與直接來源歷史保留，不遞迴複製祖先快照。
- PNG runtime、來源、數量、記憶體、儲存容量與完整 prompt 上限在付費前預檢。輸出預留 96 MiB 加輸入複本預算，不調高 PHP 配置。
- transport 限定固定 HTTPS URL、TLS 驗證、無 proxy／redirect／retry，timeout 仍用既有配置且上限 180 秒；不是供應商完成時間保證。
- HTTP／JSON／base64／metadata 皆有上限；6 MiB 回應、4 MiB PNG、指定尺寸、嚴格 base64 及結構限制。錯誤只顯示安全 HTTP／已知原因，不輸出原始回應、Key 或任意供應商文字。
- 實際模型只有回應明確提供才保存，否則 null；來源暱稱、requestedModel、provider request ID、日期、參數、prompt、資產 hash 與選用來源固定保存。Images API 正常 schema 沒有 model 欄位，不以請求值假冒回傳值。

### 實際 SQLite 與尚未執行的 native fixture

- durable running 日誌先於單次 dispatch；同 ID 的 running／failed 不會再次呼叫；completed 只讀回保存結果，late failure 不能降級已完成收據。
- PNG、完整版本、專案及 completed 收據在同一 BEGIN IMMEDIATE 交易保存。兩連線檢查部分結果不可見；在資產、專案、收據各階段失敗都 rollback；連線關閉仍保留 running／unknown，沒有孤立資產。
- success 收據必須實際更新一筆 running 記錄；owner／project／item 邊界、唯一 request ID、writer reservation 與舊版本不變都有 SQL 檢查。
- tests/image-generation-app.php 使用真實 CocreationApp／Store／MediaStore，僅注入不讀 Key 的 vault-status double 與圖片 adapter；準備了生成→採用→修改→再採用→融合、目標／來源／null actualModel、跨項目／跨 owner 拒絕、容量、重放與交易失敗 fixture。**PHP 不存在，因此全部 native fixture 明確 UNEXECUTED。**
- tests/image-provider.php 準備完整 HTTP envelope 假回應、缺 helper、32M／80M 記憶體、PNG、redaction 與零 Key lookup 的 native fixture；同樣未執行。

## 保留回歸

既有專案／項目生命週期、完整正式版、單題按鈕、方向就緒與明確生成、主要／小版樹、封存／還原、版本自身目標、選版微調／比較／融合、標題採用同步項目名稱、短文全文及長文選段保留，以及表格、流程圖／統計圖、心智圖、SVG、網頁固定圖片、圖文／海報、受限互動程式、上傳／私人 PNG／分析與匯出等回歸均納入本次 Node suite。

## 未驗證與限制

- 沒有 PHP、PDO、Apache／XAMPP HTTP 安裝／升級或原生 PNG 處理實測。詞法掃描不能證明 PHP 語法與 runtime；需在本機備份後驗收。
- 沒有真實瀏覽器桌面／行動視覺、鍵盤、影像解碼、下載、CSP、記憶體或 p5.js runtime 驗收。fake DOM／fetch 不代替實機。
- 沒有讀取、建立、設定或傳送真實 API Key，沒有 OpenAI／Ollama 真實推論；模型權限、輸出品質、延遲、費用、相容性及官方實際 PNG 變體都未實測。
- 官方不保證 PNG color type／位深／interlace；本地仍只接受不超過 4 MiB 的 8-bit 非交錯 RGB／RGBA 正規化 PNG。即使服務合法生成，也可能在本機拒存且已計費。沒有 URL fallback、假圖或暗中換格式。逾時、網路、5xx 或本機保存不明先查狀態，不自動重送；沒有 provider exactly-once 保證。
- 圖文、海報與網頁仍為完整文字＋明確固定圖片的原生編排，不自動呼叫圖片模型；要新圖先在圖片項目生成並明確引用。Ollama 對談可保留，但本模組未接入其實驗性圖片生成。
- 沒有公開部署、多人權限、KML、公共資助、共聊、外部工具緊密整合或 GitHub Actions 驗收；圖坊／形坊匯入相容性仍未驗證。

## 安全更新

只合併覆蓋程式檔，保留 config.local.php、原私有 SQLite／媒體／session 資料及 Cookie，不重新安裝、不重建資料庫。停止寫入後先離線備份設定及整個私有資料夾；新綁定欄位為相容預設 null，不猜模型、不重寫歷史。有效暫存 Key 不需重貼；到期後由使用者在本機密碼欄重新提供。快取標籤為 20261021-version17，必要時強制重新整理而不清 Cookie。
