const http = require("http");
const fs = require("fs");
const path = require("path");

const port = 3000;
const indexPath = path.join(__dirname, "web", "index.html");

// ---- パス定義 ----
const RECEPTION_REQUESTS_DIR = path.join(__dirname, "company", "reception", "REQUESTS");
const SECRETARY_INBOX = path.join(__dirname, "company", "secretary", "INBOX.md");
const SECRETARY_TEMPLATE = path.join(__dirname, "company", "secretary", "REQUEST_TEMPLATE.md");
const PM_DIR = path.join(__dirname, "company", "pm");
const PM_QUEUE = path.join(__dirname, "company", "pm", "QUEUE.md");

// ---- ユーティリティ ----

function pad(n) {
  return String(n).padStart(3, "0");
}

/**
 * REQUESTS/ フォルダを見て次の受付番号を決める
 */
function nextCaseNumber(dir) {
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch (_) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const nums = files
    .map(f => f.match(/^CASE_(\d+)\.md$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  return nums.length > 0 ? Math.max(...nums) + 1 : 1;
}

/**
 * 現在日時を "YYYY-MM-DD HH:mm" 形式で返す
 */
function nowStr() {
  const d = new Date();
  const pad2 = n => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

// ---- ファイル生成ロジック ----

/**
 * company/reception/REQUESTS/CASE_XXX.md を作成する
 */
function createReceptionCase(num, data, dateStr) {
  const caseId = `CASE_${pad(num)}`;
  const filePath = path.join(RECEPTION_REQUESTS_DIR, `${caseId}.md`);
  const content = `# 受付票 ${caseId}

## 基本情報

- 受付番号：${caseId}
- 受付日時：${dateStr}
- 現在ステータス：受付済み
- 次に渡す部署：secretary → pm

## 依頼内容

### 表面依頼

${data.request || "（未入力）"}

### 目的

${data.purpose || "（未入力）"}

### 欲しい成果物

${data.output || "（未入力）"}

### 制約条件

${data.constraints || "特になし"}
`;
  fs.writeFileSync(filePath, content, "utf8");
  return { caseId, filePath };
}

/**
 * company/secretary/INBOX.md の末尾に追記する
 */
function appendToInbox(caseId, data, dateStr) {
  const entry = `
---

## ${dateStr}（${caseId}）

- 受付番号：${caseId}
- 表面依頼：${data.request || "（未入力）"}
- 目的：${data.purpose || "（未入力）"}
- 欲しい成果物：${data.output || "（未入力）"}
- 制約条件：${data.constraints || "特になし"}
- 次に渡す部署：pm
`;
  fs.appendFileSync(SECRETARY_INBOX, entry, "utf8");
}

/**
 * company/secretary/REQUEST_TEMPLATE.md に今回の依頼を追記する
 * （既存テンプレート末尾に新しいセクションを足す）
 */
function updateRequestTemplate(caseId, data, dateStr) {
  const section = `
---

## 依頼：${data.request ? data.request.slice(0, 40) : caseId}（${caseId}）

表面依頼
- ${data.request || "（未入力）"}

目的
- ${data.purpose || "（未入力）"}

欲しい成果物
- ${data.output || "（未入力）"}

制約条件
- 期限：未定
- 予算：未定
- その他：${data.constraints || "特になし"}

不足情報
- （受付時点では未整理。秘書が壁打ちして埋める）

次に渡す部署
- pm

受付日時：${dateStr}
`;
  fs.appendFileSync(SECRETARY_TEMPLATE, section, "utf8");
}

/**
 * company/pm/CASE_XXX.md を作成する
 */
function createPmCase(num, data, dateStr) {
  const caseId = `CASE_${pad(num)}`;
  const filePath = path.join(PM_DIR, `${caseId}.md`);
  const title = data.request ? data.request.slice(0, 40) : caseId;
  const content = `# ${caseId}：${title}

## 案件情報

- 案件名：${title}
- 受付番号：${caseId}
- 受付日時：${dateStr}
- 現在ステータス：受付済み・PM起票待ち

## 依頼内容

### 表面依頼

${data.request || "（未入力）"}

### 目的

${data.purpose || "（未入力）"}

### 欲しい成果物

${data.output || "（未入力）"}

### 制約条件

${data.constraints || "特になし"}

## 想定フロー

1. secretary → 依頼の整理・壁打ち・不足情報補完
2. pm → 部署振り分け・依頼票作成
3. research → 情報収集（必要な場合）
4. analysis → 分析・整理（必要な場合）
5. marketing → 成果物整形（必要な場合）
6. qa → 品質チェック
7. 納品

## 次アクション

- [ ] secretaryによる依頼の壁打ち・整理
- [ ] pmによる部署振り分け判断
- [ ] 担当・期限・成果物の三点セット確定
`;
  fs.writeFileSync(filePath, content, "utf8");
  return { caseId, filePath };
}

/**
 * company/pm/QUEUE.md に案件1行を追記する
 */
function appendToQueue(num, data, dateStr) {
  const caseId = `CASE_${pad(num)}`;
  const title = data.request ? data.request.slice(0, 30) : caseId;
  const row = `| ${caseId} | ${title} | 受付済み | secretaryによる整理待ち |\n`;
  fs.appendFileSync(PM_QUEUE, row, "utf8");
}

// ---- リクエスト処理 ----

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => { chunks.push(chunk); });
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error("JSONパースエラー"));
      }
    });
    req.on("error", reject);
  });
}

async function handleCompanyIntake(req, res) {
  let data;
  try {
    data = await parseBody(req);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: false, message: "リクエストのJSONが不正です" }));
    return;
  }

  if (!data.request || !String(data.request).trim()) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: false, message: "依頼内容（request）は必須です" }));
    return;
  }

  try {
    // ディレクトリ確認
    if (!fs.existsSync(RECEPTION_REQUESTS_DIR)) {
      fs.mkdirSync(RECEPTION_REQUESTS_DIR, { recursive: true });
    }
    if (!fs.existsSync(PM_DIR)) {
      fs.mkdirSync(PM_DIR, { recursive: true });
    }

    const num = nextCaseNumber(RECEPTION_REQUESTS_DIR);
    const dateStr = nowStr();

    // 1. 受付票を作成
    const reception = createReceptionCase(num, data, dateStr);

    // 2. 秘書 INBOX に追記
    appendToInbox(reception.caseId, data, dateStr);

    // 3. 秘書 REQUEST_TEMPLATE を更新
    updateRequestTemplate(reception.caseId, data, dateStr);

    // 4. PM CASE を作成
    const pm = createPmCase(num, data, dateStr);

    // 5. PM QUEUE に追記
    appendToQueue(num, data, dateStr);

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      success: true,
      caseId: reception.caseId,
      receptionFile: `company/reception/REQUESTS/${reception.caseId}.md`,
      secretaryInbox: "company/secretary/INBOX.md（末尾に追記）",
      secretaryTemplate: "company/secretary/REQUEST_TEMPLATE.md（末尾に追記）",
      pmCase: `company/pm/${pm.caseId}.md`,
      pmQueue: "company/pm/QUEUE.md（1行追加）",
      message: `受付完了。${reception.caseId} として記録しました。`
    }));
  } catch (e) {
    console.error("company-intake エラー:", e);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: false, message: `サーバーエラーが発生しました: ${e.message}` }));
  }
}

// ---- HTTPサーバー ----

const server = http.createServer(async (req, res) => {
  // POST /api/company-intake
  if (req.method === "POST" && req.url === "/api/company-intake") {
    await handleCompanyIntake(req, res);
    return;
  }

  // GET /
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    fs.readFile(indexPath, "utf8", (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("index.html の読み込みに失敗しました");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

server.listen(port, () => {
  console.log(`受付プロトタイプ起動: http://localhost:${port}`);
});
