# AI 共創室

以專案為核心的繁體中文共創工作台。每個專案可放一個或多個創作項目；學生透過對話、比較與選擇參與創作，而不是只按生成。

**本機試作版｜PHP 7.4 相容語法 / SQLite / OpenAI Responses API 或本機 Ollama / HTTP 網頁安裝。** 不需 CLI、Node、npm、Composer 或 MySQL。沒有帳號與班級權限，只能在 PHP 主機本機使用，禁止公開、區網、反向代理或隧道。

## 本次交付邊界

- 已實作專案新增、編輯、重新開啟，以及多個創作項目的新增、選取、封存與還原。
- 第一個可實際共創的類型是「標題名稱」。一個版本保存整組 1–12 個可自訂名稱的文字項目，不是固定四欄。中文名稱、英文名稱、Slogan、介紹短文只是例子。
- 文章、海報、網頁、互動程式目前只有規劃位置，可保存名稱、說明與固定版本引用。**尚未提供這些類型的生成器，不會假裝能生成圖片、網站或程式。**
- 這是架構與第一個文字創作能力的階段交付；不是所有創作類型都已完成。

## 專案、創作項目與內容項目

1. 專案：有自己的名稱、說明、進度；提供共享脈絡。
2. 創作項目：例如品牌命名、活動命名、海報規劃。每個都有自己的對話、目標、候選組、正式版、比較與定稿歷程。
3. 內容項目：某個命名候選組內的具名文字，例如「活動名稱」「開場提問」「行動邀請」。可自行增加與命名，穩定 ID 保留跨版本關係。

名稱與文字生成不會改寫專案名稱。切換創作項目不會把對話或版本混在一起。

## 共創流程

- 左側約 1/3 保留完整對話；右側約 2/3 展示目標、正式版、候選組及工作區。窄螢幕依序堆疊。
- 一次只問一個重點，至少三輪後整理目標與這組內容要包含的項目。學生確認後，才可另外按「產生候選」。
- 每次產生 3–5 組新候選，舊候選並存，不自動取代正式版。手動編輯需明確「保存為新版本」，不覆寫原版本。
- 選為正式版後可在對話中直接要求修改，產生完整、可審閱的新修訂；看過差異並採用後，下一輪從新的正式版繼續。普通釐清不假裝改動，日常修訂不必重走目標確認。
- 可以選 2–5 個正式／候選版本，請 AI 依目前確認的目標評估整組一致性、優點、取捨與建議。不強迫選冠軍。
- 只有學生明確操作才會升為正式版、將項目定稿或結案專案。重新開啟後歷史與舊定稿快照保留。
- 已封存項目不計入專案結案條件，且可還原；其資料沒有刪除。尚未實作的規劃項目不會自動算完成。

## 明確的跨項目引用

可把同專案另一創作項目的某個版本加入目前項目。引用包含來源項目、版本 ID、完整內容、模型來源與固定時間。來源後來改版、換正式版或重新開啟，都不會改掉已固定的引用。要採用新來源，請明確移除舊引用並加入新版本。AI 看得到被引用的文字，但不能修改來源作品。

## AI 與模型

系統設定統一管理 OpenAI / Ollama、服務位置與最近使用模型；對話區可臨時切換下次使用的服務與模型，專案內容不會重設。每次 AI 回覆、候選與比較保存當次供應者、要求的模型、服務實際回報的模型及時間。服務沒回報實際型號時，畫面誠實標明，不以後來的設定重標舊紀錄。

- OpenAI 金鑰只在私有伺服器工作階段暫存，最長可用 30 分鐘。每次推論需明確確認傳送內容與費用；API 計費與 ChatGPT 訂閱不同。
- Ollama 只接受 loopback HTTP 服務，固定 `/api/chat` 與 `/api/tags`，沒有自訂遠端 API 目的地，也不會把 OpenAI Key 傳給 Ollama。
- 連線檢查只讀取模型資訊，不做推論、不下載模型。成功不代表已驗證結構化輸出、創作品質或足夠硬體效能。
- 不自動改供應者、不自動重試、不在錯誤時暗中使用示範答案。

## 安裝與文件

先讀 [開始使用](開始使用.txt)，完整步驟見 [瀏覽器安裝](docs/INSTALLATION.md)。

原始碼儲存庫：[shinjia/ai-cocreation](https://github.com/shinjia/ai-cocreation)。目前原始碼已包含修補01（POST JSON `body.action`）與修補02（正式版持續修訂）。GitHub 的「Download ZIP」解壓後，請將資料夾改名為 `ai-cocreation-series-php74`，即可直接沿用文件中的本機網址；也可保留其他名稱並調整網址。

**既有安裝更新：** 先停止寫入並備份程式與私有資料，將更新的原始碼合併覆蓋到原程式根目錄。不要先刪除舊資料夾，不要重新安裝，不要覆蓋 `config.local.php` 或私有資料夾。更新後重新整理頁面；若仍是舊畫面再強制重新整理。完整原始碼不包含你的設定、資料庫、工作階段或金鑰。

[安全邊界](docs/SECURITY.md) · [使用指南](docs/USER-GUIDE.md) · [架構](docs/ARCHITECTURE.md) · [測試與限制](docs/TEST-REPORT.md)

本次未使用真實金鑰／模型、未公開部署。缺少 PHP runtime，Chromium 也無法啟動，因此不能將來源契約、SQLite 或模擬測試說成已完成 PHP、Apache、瀏覽器實機驗收。

官方規格核對日期：2026-10-21。[OpenAI 結構化輸出](https://developers.openai.com/api/docs/guides/structured-outputs)、[GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)、[Ollama Chat API](https://docs.ollama.com/api/chat)、[Ollama 模型清單](https://docs.ollama.com/api/tags)、[Ollama 結構化輸出](https://docs.ollama.com/capabilities/structured-outputs)。

## 開發者檢查（一般使用者不必執行）

在儲存庫根目錄執行以下檢查；PHP fixture 使用測試替身，不會呼叫真實 AI：

```sh
node --test tests/*.test.mjs
node --check public/app.js
node --check public/demo.js
python3 tests/sqlite-check.py
python3 tests/php-structure-check.py  # 需 Pygments；只是詞法／括號檢查
php tests/run.php
php tests/revision.php
```

2026-10-21 已重跑並通過 53 項 Node 測試、7 項 Python SQLite 檢查及 18 份 PHP 詞法／括號檢查。最後兩項 PHP fixture 因環境沒有 PHP 而**未執行**，不是已通過的後端驗收。尚未設定 GitHub Actions，推送本身不代表 CI 或實際模型驗證通過。

提交前請再次檢查暫存清單；`.gitignore` 不是秘密掃描器。不可提交 `config.local.php`、`.env`、資料庫、私有資料、Session、Key 檔案、個人作品匯出或包含這些資料的備份壓縮檔。
