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
const MARKETING_DIR = path.join(__dirname, "company", "marketing");
const SHIORI_PATH = path.join(MARKETING_DIR, "shiori.md");
const RESEARCH_REQUESTS_DIR = path.join(__dirname, "company", "research", "REQUESTS");
const RESEARCH_RESULTS_DIR = path.join(__dirname, "company", "research", "RESULTS");

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

// ---- research ロジック ----

/**
 * company/research/REQUESTS/CASE_XXX.md を生成する
 */
function createResearchRequest(caseId, fields, dateStr) {
  const filePath = path.join(RESEARCH_REQUESTS_DIR, `${caseId}.md`);
  const { title, request, purpose, output, constraints } = fields;

  const content = `# research依頼票：${caseId}

## 基本情報

- 案件番号：${caseId}
- 依頼日時：${dateStr}
- 次に返す先：marketing

## 調査目的

${purpose || "（PM案件より：" + (request || "未記載") + "）"}

## 調査対象

${title || request || "（未指定）"}

## 確認したい論点

- 依頼内容に関連する主要スポット・施設の概要
- 移動手段・アクセスの選択肢と注意点
- 対象者（${constraints || "依頼者"}）に適した条件
- 食事・宿泊に関する選択肢
- 現地での注意事項・トラブル回避ポイント

## 制約条件

${constraints || "特になし"}

## 参照元PM案件

company/pm/${caseId}.md

## 次に返す先

marketing（research結果をもとにしおりを生成する）
`;

  fs.mkdirSync(RESEARCH_REQUESTS_DIR, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

/**
 * 旅行案件の仮調査結果を生成する
 */
function buildTravelResearchResult(request, constraints) {
  const text = `${request} ${constraints}`;

  const GENERIC = new Set(["家族", "一人", "二人", "友人", "夫婦", "仲間", "同僚", "カップル"]);
  const destCandidates = [...request.matchAll(/の([^\s　の]{2,5})(旅行|観光)/g)]
    .map(m => m[1])
    .filter(name => !GENERIC.has(name));
  const dest = destCandidates.length > 0 ? destCandidates[destCandidates.length - 1] : "目的地";

  const hasKids = /こども|子ども|子供|ベビー|幼児|赤ちゃん/.test(text);
  const kidAges = constraints.match(/\d+歳/g) || [];

  const lines = [];

  lines.push(`## 候補スポット（仮・要追加確認）`);
  lines.push("");
  if (dest === "横浜") {
    lines.push("- **よこはまアンパンマンこどもミュージアム** ── 乳幼児向け、屋内、雨天可");
    lines.push("  - 未確認：混雑状況（GW期間は事前予約推奨の可能性あり）");
    lines.push("- **八景島シーパラダイス** ── 水族館＋遊園地、広い、半屋外");
    lines.push("  - 未確認：ベビーカー貸出の有無、授乳室の場所");
    lines.push("- **みなとみらい** ── コスモワールド観覧車、ショッピング施設、海沿い散策");
    lines.push("  - 未確認：GW期間の混雑ピーク時間帯");
    lines.push("- **山下公園・赤レンガ倉庫** ── 広い公園、屋外、授乳室は近くの施設を要確認");
    lines.push("- **横浜中華街** ── 飲食店多数、ベビーカーでの通行は混雑時に困難");
    lines.push("  - 未確認：GW期間の混雑状況");
  } else {
    lines.push(`- ${dest}の主要観光スポット（未確認・要リサーチ追加）`);
    lines.push(`  - 未確認：乳幼児向け施設の詳細`);
  }
  lines.push("");

  lines.push(`## 移動観点（仮）`);
  lines.push("");
  if (dest === "横浜") {
    lines.push("- 都内からの場合：東急東横線・みなとみらい線、JR京浜東北線など複数ルートあり");
    lines.push("- ベビーカー利用時：エレベーター完備駅の事前確認を推奨");
    lines.push("- 横浜市内移動：みなとみらい線1日乗車券が便利な場合あり");
    lines.push("- 未確認：出発地（依頼に記載なし）。確認後に最適ルートを追記");
    lines.push("- 未確認：レンタカー利用希望の有無");
  } else {
    lines.push(`- ${dest}への主要交通手段（未確認）`);
    lines.push("- 未確認：出発地（依頼に記載なし）");
  }
  lines.push("");

  if (hasKids) {
    lines.push(`## 子連れ観点（仮）`);
    lines.push("");
    if (kidAges.length > 0) {
      lines.push(`- 対象年齢：${kidAges.join("・")}のこども`);
    }
    lines.push("- 1〜2歳は歩行不安定なため、ベビーカーまたは抱っこ紐の利用が前提");
    lines.push("- 授乳・おむつ替えスペースの事前確認が必要（施設ごとに異なる）");
    lines.push("- 長距離移動は午前のうちに終わらせると昼寝リズムを保ちやすい");
    lines.push("- 未確認：ベビーカー持参の有無（移動計画に大きく影響）");
    lines.push("- 未確認：食事制限・アレルギーの有無");
    lines.push("");
  }

  lines.push(`## 食事観点（仮）`);
  lines.push("");
  if (dest === "横浜") {
    lines.push("- 横浜中華街：バリエーション豊富だがGW期間は大混雑、早めの入店推奨");
    lines.push("- みなとみらい周辺：ショッピングモール内のフードコートが子連れに使いやすい");
    lines.push("- 赤レンガ倉庫周辺：カフェ・レストラン複数、テラス席あり（天候次第）");
    lines.push("- 未確認：アレルギー・食事制限の有無（確認後に候補を絞り込む）");
  } else {
    lines.push(`- ${dest}周辺の食事スポット（未確認・要リサーチ追加）`);
    lines.push("- 未確認：アレルギー・食事制限の有無");
  }
  lines.push("");

  lines.push(`## 注意点（仮）`);
  lines.push("");
  lines.push("- ゴールデンウィーク期間は全国的に観光地の混雑がピーク。入場待ち・駐車場待ちを想定する");
  lines.push("- 人気スポットの事前予約（チケット・レストラン）を強く推奨");
  if (hasKids) {
    lines.push("- 乳幼児連れの場合、予定に余白を多めに設けることを推奨（急な体調変化等）");
    lines.push("- 夕方以降は子どもの疲れがピークになりやすい。宿への帰着時間に余裕を");
  }
  lines.push("- 未確認：宿泊施設（予約済みかどうか・エリア）。旅程に大きく影響する");
  lines.push("- 未確認：旅行日程（出発日・帰着日）");
  lines.push("");

  lines.push(`> ※ この調査結果は PM案件の情報のみをもとに構成した仮情報です。`);
  lines.push(`> 実際の調査（Web検索・現地確認等）を経て内容を更新してください。`);
  lines.push(`> 「未確認」と記載した項目は依頼者への確認または追加調査が必要です。`);

  return lines.join("\n");
}

/**
 * company/research/RESULTS/CASE_XXX.md を生成する
 */
function createResearchResult(caseId, fields, dateStr) {
  const filePath = path.join(RESEARCH_RESULTS_DIR, `${caseId}.md`);
  const { request, purpose, constraints } = fields;

  const text = `${request} ${fields.output}`;
  const isTravel = /旅行|旅程|しおり|観光/.test(text);

  let bodyContent;
  if (isTravel) {
    bodyContent = buildTravelResearchResult(request || "", constraints || "");
  } else {
    bodyContent = `## 調査結果（仮）\n\n- 依頼の種類から自動生成できませんでした。手動でリサーチ結果を記入してください。\n`;
  }

  const content = `# research結果：${caseId}

## メタ情報

- 案件番号：${caseId}
- 生成日時：${dateStr}
- 調査種別：仮想内製生成（外部AI連携なし）
- ステータス：仮情報・要追加確認

## 調査対象

${request || "（未記載）"}

## 調査目的

${purpose || "（未記載）"}

---

${bodyContent}
`;

  fs.mkdirSync(RESEARCH_RESULTS_DIR, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

/**
 * research結果ファイルから主要セクションを抽出する
 */
function parseResearchResultFile(content) {
  const result = {};

  // ## セクションを抽出するヘルパー
  function extractSection(heading) {
    const idx = content.indexOf(`## ${heading}`);
    if (idx === -1) return "";
    const after = content.slice(idx + `## ${heading}`.length);
    const nextSection = after.search(/\n## /);
    return (nextSection === -1 ? after : after.slice(0, nextSection)).trim();
  }

  result.spots    = extractSection("候補スポット（仮・要追加確認）");
  result.transport = extractSection("移動観点（仮）");
  result.kids     = extractSection("子連れ観点（仮）");
  result.food     = extractSection("食事観点（仮）");
  result.cautions = extractSection("注意点（仮）");

  return result;
}

// ---- しおり生成ロジック ----

/**
 * PM案件ファイルのMarkdownから主要セクションを抽出する
 */
function parsePmCaseFile(content) {
  const result = {};

  // タイトル行から案件名を取得
  const titleMatch = content.match(/^# (.+)/m);
  if (titleMatch) result.title = titleMatch[1].trim();

  // ### セクションを抽出するヘルパー
  function extractSection(heading) {
    const idx = content.indexOf(`### ${heading}`);
    if (idx === -1) return "";
    const after = content.slice(idx + `### ${heading}`.length);
    const nextSection = after.search(/\n##/);
    return (nextSection === -1 ? after : after.slice(0, nextSection)).trim();
  }

  result.request     = extractSection("表面依頼");
  result.purpose     = extractSection("目的");
  result.output      = extractSection("欲しい成果物");
  result.constraints = extractSection("制約条件");

  return result;
}

/**
 * 制約条件・依頼内容から想定読者を推定する
 */
function inferAudience(request, constraints) {
  const text = `${request} ${constraints}`;
  const lines = [];

  if (/こども|子ども|子供|ベビー|幼児|赤ちゃん/.test(text)) {
    lines.push("- 小さい子ども連れの家族");
    const ages = constraints.match(/\d+歳/g);
    if (ages) lines.push(`- 子どもの年齢：${ages.join("・")}`);
  } else if (/家族/.test(text)) {
    lines.push("- 家族全員");
  }

  if (/夫婦|カップル|パートナー/.test(text)) lines.push("- 大人ふたり");
  if (/シニア|高齢|親/.test(text)) lines.push("- 高齢者を含むグループ");

  if (lines.length === 0) lines.push("- （依頼内容から自動判定できません。確認が必要です）");
  return lines.join("\n");
}

/**
 * 全角数字を半角数字に変換する
 */
function toHalfWidth(str) {
  return str.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48));
}

/**
 * 旅行・成果物のたたき台骨子を生成する
 */
function buildDraftContent(request, purpose, output, constraints) {
  const text = `${request} ${output}`;
  const lines = [];

  if (/旅行|旅程|しおり|観光/.test(text)) {
    const normalizedReq = toHalfWidth(request);
    const daysMatch = normalizedReq.match(/(\d+)泊(\d+)日/);
    const days = daysMatch ? parseInt(daysMatch[2], 10) : null;

    // 「の地名旅行」パターンで地名を抽出（家族・一人などの汎用語は除外）
    const GENERIC = new Set(["家族", "一人", "二人", "友人", "夫婦", "仲間", "同僚", "カップル"]);
    const destCandidates = [...request.matchAll(/の([^\s　の]{2,5})(旅行|観光)/g)]
      .map(m => m[1])
      .filter(name => !GENERIC.has(name));
    const dest = destCandidates.length > 0 ? destCandidates[destCandidates.length - 1] : null;

    lines.push("### 旅程骨子（たたき台）");
    lines.push("");
    if (days) {
      for (let i = 1; i <= days; i++) {
        lines.push(`**${i}日目**`);
        lines.push("- 午前：移動・チェックイン・観光スポット（要確認）");
        lines.push("- 昼食：地元の食事場所（要確認）");
        lines.push("- 午後：観光スポット・休憩（要確認）");
        lines.push("- 夕食：夕食場所（要確認）");
        if (i < days) lines.push("- 宿泊：（宿泊先）");
        lines.push("");
      }
    } else {
      lines.push("- 日程が未確定のため、旅程は確認後に組み立てます。");
      lines.push("");
    }

    if (dest) {
      lines.push(`### ${dest}の候補スポット（仮）`);
      lines.push("");
      if (dest === "横浜") {
        lines.push("- みなとみらい（観覧車・ショッピングモール）");
        lines.push("- 山下公園・赤レンガ倉庫（海沿い散策）");
        lines.push("- 横浜中華街（ランチ・夕食候補）");
        lines.push("- 八景島シーパラダイス（子連れ向け水族館・遊園地）");
        lines.push("- よこはまアンパンマンこどもミュージアム（乳幼児向け）");
      } else {
        lines.push(`- ${dest}の主要観光スポット（research後に追記）`);
      }
    }

    lines.push("");
    lines.push("> ※ このたたき台は受付情報のみをもとに構成しています。");
    lines.push("> research・analysis の結果を受けて内容を更新します。");
  } else {
    lines.push("- 依頼の種類から構成を自動判定できませんでした。");
    lines.push("- 「次に確認したいこと」を埋めてから、具体的な内容を組み立てます。");
  }

  return lines.join("\n");
}

/**
 * 不足情報から「次に確認したいこと」を生成する
 */
function buildNextQuestions(request, purpose, output, constraints) {
  const text = `${request} ${constraints}`;
  const lines = [];

  if (!/出発地|から出発|東京|大阪|名古屋/.test(text))
    lines.push("- [ ] 出発地と交通手段（新幹線・車・飛行機など）");
  if (!/ホテル|旅館|宿泊/.test(text))
    lines.push("- [ ] 宿泊場所・エリアの希望（または予約済みかどうか）");
  if (!/予算|円/.test(text))
    lines.push("- [ ] 旅行全体の予算感（宿泊・食費・交通費の目安）");
  if (/こども|子ども|子供|ベビー|幼児/.test(text)) {
    lines.push("- [ ] ベビーカー持参の有無（移動・スポット選定に影響）");
    lines.push("- [ ] 子どもの食事制限・アレルギーの有無");
    lines.push("- [ ] 授乳・おむつ替えスペースの優先度");
  }
  if (!/\d{4}[-\/]\d{1,2}|\d月\d日/.test(text))
    lines.push("- [ ] 具体的な旅行日程（出発日・帰着日）");
  if (!/PDF|印刷|A4|デジタル/.test(`${request} ${output}`))
    lines.push("- [ ] しおりの形式（印刷用・スマホで見る・どちらでもよいか）");
  if (!/ページ|枚/.test(output))
    lines.push("- [ ] しおりのボリューム感（1〜2ページ程度か、詳細版か）");

  return lines.length > 0
    ? lines.join("\n")
    : "- 現時点で確認が必要な不足情報はありません。research段階で詳細を補完します。";
}

/**
 * research結果をもとに旅程たたき台を生成する
 */
function buildDraftContentFromResearch(pmFields, researchFields, dateStr) {
  const { request, constraints } = pmFields;
  const text = `${request} ${pmFields.output}`;

  const lines = [];

  if (!/旅行|旅程|しおり|観光/.test(text)) {
    lines.push("- 依頼の種類から構成を自動判定できませんでした。");
    lines.push("- research結果を参照しながら、具体的な内容を組み立ててください。");
    return lines.join("\n");
  }

  const normalizedReq = toHalfWidth(request || "");
  const daysMatch = normalizedReq.match(/(\d+)泊(\d+)日/);
  const days = daysMatch ? parseInt(daysMatch[2], 10) : null;

  lines.push("### 旅程骨子（research結果をもとにしたたたき台）");
  lines.push("");

  if (days) {
    for (let i = 1; i <= days; i++) {
      lines.push(`**${i}日目**`);
      if (i === 1) {
        lines.push("- 午前：移動・チェックイン（出発地未確認のためルート要確認）");
        lines.push("- 昼食：到着エリア周辺の飲食店（混雑を避け早めの入店推奨）");
        lines.push("- 午後：候補スポット①（research結果の候補スポットから選定）");
        lines.push("- 夕食：候補スポット付近の飲食店（要事前予約）");
        lines.push("- 宿泊：（宿泊先要確認）");
      } else if (i === days) {
        lines.push("- 午前：候補スポット②（午前中の早い時間に移動・見学）");
        lines.push("- 昼食：帰路付近の飲食店");
        lines.push("- 午後：帰路（混雑を避けるため早めの出発推奨）");
        lines.push("- 夕食：帰路または自宅付近");
      } else {
        lines.push("- 午前：候補スポット③（開園直後の入場で混雑回避）");
        lines.push("- 昼食：スポット内または周辺（ピーク時間を外す）");
        lines.push("- 午後：散策・休憩（子どもの疲れに応じて調整）");
        lines.push("- 夕食：エリア周辺の飲食店（事前予約推奨）");
        lines.push("- 宿泊：（宿泊先要確認）");
      }
      lines.push("");
    }
  } else {
    lines.push("- 日程未確定のため、旅程は確認後に組み立てます。");
    lines.push("");
  }

  if (researchFields.spots) {
    lines.push("### 候補スポット（research結果より）");
    lines.push("");
    lines.push(researchFields.spots);
    lines.push("");
  }

  if (researchFields.transport) {
    lines.push("### 移動観点（research結果より）");
    lines.push("");
    lines.push(researchFields.transport);
    lines.push("");
  }

  if (researchFields.kids) {
    lines.push("### 子連れ観点（research結果より）");
    lines.push("");
    lines.push(researchFields.kids);
    lines.push("");
  }

  if (researchFields.food) {
    lines.push("### 食事観点（research結果より）");
    lines.push("");
    lines.push(researchFields.food);
    lines.push("");
  }

  if (researchFields.cautions) {
    lines.push("### 注意点（research結果より）");
    lines.push("");
    lines.push(researchFields.cautions);
    lines.push("");
  }

  lines.push(`> ※ このたたき台は research 部門の仮調査結果をもとに構成しています。`);
  lines.push(`> 「未確認」項目を依頼者と確認の上、内容を更新してください。`);

  return lines.join("\n");
}

/**
 * company/marketing/shiori.md の内容を生成する
 * researchFields が渡された場合はそちらを優先する
 */
function generateShioriContent(caseId, pmFields, dateStr, researchFields) {
  const { title, request, purpose, output, constraints } = pmFields;

  const shioriTitle = request || title || caseId;
  const audience = inferAudience(request || "", constraints || "");
  const draft = researchFields
    ? buildDraftContentFromResearch(pmFields, researchFields, dateStr)
    : buildDraftContent(request || "", purpose || "", output || "", constraints || "");
  const nextQ = buildNextQuestions(request || "", purpose || "", output || "", constraints || "");

  const researchNote = researchFields
    ? `research結果：company/research/RESULTS/${caseId}.md`
    : "research：未実施（PM案件のみで生成）";

  return `# しおり：${shioriTitle}

生成日時：${dateStr}
元案件：${caseId}
${researchNote}

---

## この依頼の目的

${purpose || "（目的が明示されていません。次のステップで確認が必要です）"}

---

## 依頼概要

${request || "（依頼内容を取得できませんでした）"}

---

## 欲しい成果物

${output || "（成果物の指定なし）"}

---

## 制約条件

${constraints || "特になし"}

---

## 想定読者

${audience}

---

## 進め方

1. 本しおりのたたき台を依頼者に確認してもらう
2. 「次に確認したいこと」の不足情報を埋める
3. 必要に応じて research 部門で追加調査を行う
4. analysis 部門で内容を整理する（必要な場合）
5. marketing 部門が最終成果物に仕上げる
6. qa 部門で品質チェックを行う

---

## たたき台の提案内容

${draft}

---

## 次に確認したいこと

${nextQ}
`;
}

/**
 * POST /api/generate-shiori ハンドラ
 * PM案件 → research依頼票 → research結果 → shiori の3ステップで生成する
 */
async function handleGenerateShiori(req, res) {
  let data = {};
  try {
    data = await parseBody(req);
  } catch (_) {
    // body なしも許容（デフォルト値を使う）
  }

  const caseId = (data.caseId && String(data.caseId).trim()) || "CASE_002";
  const pmFilePath = path.join(PM_DIR, `${caseId}.md`);

  if (!fs.existsSync(pmFilePath)) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      success: false,
      message: `PM案件ファイルが見つかりません：company/pm/${caseId}.md`
    }));
    return;
  }

  try {
    const pmContent = fs.readFileSync(pmFilePath, "utf8");
    const pmFields = parsePmCaseFile(pmContent);
    const dateStr = nowStr();

    // ステップ1：research依頼票を生成
    const researchRequestFile = createResearchRequest(caseId, pmFields, dateStr);
    const researchRequestRelative = `company/research/REQUESTS/${caseId}.md`;

    // ステップ2：research結果（仮）を生成
    const researchResultFile = createResearchResult(caseId, pmFields, dateStr);
    const researchResultRelative = `company/research/RESULTS/${caseId}.md`;

    // ステップ3：research結果を読み込んでしおりを生成
    const researchContent = fs.readFileSync(researchResultFile, "utf8");
    const researchFields = parseResearchResultFile(researchContent);

    if (!fs.existsSync(MARKETING_DIR)) {
      fs.mkdirSync(MARKETING_DIR, { recursive: true });
    }
    const shioriContent = generateShioriContent(caseId, pmFields, dateStr, researchFields);
    fs.writeFileSync(SHIORI_PATH, shioriContent, "utf8");

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      success: true,
      caseId,
      researchRequestFile: researchRequestRelative,
      researchResultFile: researchResultRelative,
      outputFile: "company/marketing/shiori.md",
      message: `${caseId} の research → shiori を生成しました`
    }));
  } catch (e) {
    console.error("generate-shiori エラー:", e);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      success: false,
      message: `生成中にエラーが発生しました: ${e.message}`
    }));
  }
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

  // POST /api/generate-shiori
  if (req.method === "POST" && req.url === "/api/generate-shiori") {
    await handleGenerateShiori(req, res);
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
