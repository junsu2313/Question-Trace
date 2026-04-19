const state = {
  data: null,
  notices: [],
  topic: "all",
  query: "",
  sort: "newest",
  view: "overview",
  modelSort: "usage",
  selectedDay: null,
  calendarYear: null,
  activityYear: null,
  patternMode: "daily",
  patternDay: null,
  rangeStart: null,
  rangeEnd: null,
  rangePending: false,
  selectionCleared: false,
  inspectMonth: null,
  inspectedIndexes: [],
  selectedConversationIndex: null,
  selectedNoticeId: null,
};

const topicLabels = new Map();
const localTopicRules = [
  { id: "ai", label: "AI / Agent", keys: ["ai", "gpt", "llm", "agent", "model", "prompt", "openai", "claude", "gemini", "에이전트", "모델", "프롬프트"] },
  { id: "dev", label: "Dev / Code", keys: ["code", "react", "expo", "python", "android", "api", "error", "build", "코드", "개발", "앱", "웹", "오류", "빌드"] },
  { id: "infra", label: "Infra / Hardware", keys: ["server", "gpu", "cpu", "nas", "network", "서버", "네트워크", "백업", "로그"] },
  { id: "startup", label: "Startup / Business", keys: ["mvp", "product", "business", "market", "brand", "사업", "제품", "시장", "브랜드"] },
  { id: "learning", label: "Learning / Research", keys: ["study", "research", "paper", "summary", "학습", "공부", "논문", "요약", "정리"] },
  { id: "personal", label: "Personal / Planning", keys: ["plan", "routine", "travel", "memo", "계획", "루틴", "여행", "메모", "생각"] },
];

const fallbackNotices = [
  {
    id: "question-trace-notice-2026-04-18",
    date: "2026-04-18",
    short_title: "",
    category: "운영 안내",
    title: "로컬 데이터 분석 제공 안내",
    body: "현재 이 웹에선 사용자의 로컬 데이터를 사용하지 않습니다. 사용자의 데이터를 이용한 분석은 추후 공개될 앱에서 제공합니다.\n이것은 보다 로컬 친화적인 환경을 제공하기 위한 선택입니다! 감사합니다.",
  },
];


function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDataSource(data) {
  if (data.sourceKind === "local" || /local/i.test(data.sourceFile || "")) return "Local Conversation";
  return "sample.json";
}

function updateFilePickerLabel(label) {
  const current = document.querySelector(".file-picker-current");
  if (current) current.textContent = label;
}

function addCount(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function sortedCounts(map) {
  return [...map.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

function topicLabel(id) {
  return topicLabels.get(id) || id;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function renderMarkdown(text) {
  const source = String(text || "");
  const parts = source.split(/(```[\s\S]*?```)/g);
  return parts.map((part) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const body = part.slice(3, -3).replace(/^\w+\n/, "");
      return `<pre><code>${escapeHtml(body.trim())}</code></pre>`;
    }

    return escapeHtml(part)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }).join("");
}

function roleName(role) {
  if (role === "user") return "user";
  if (role === "assistant") return "GPT";
  if (role === "tool") return "tool";
  if (role === "system") return "system";
  return role || "message";
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  localStorage.setItem("conversation-theme", isDark ? "dark" : "light");
  const button = document.querySelector("#theme-toggle");
  if (!button) return;
  button.setAttribute("aria-pressed", String(isDark));
  button.querySelector("span").textContent = isDark ? "Dark" : "Light";
}

function initTheme() {
  const saved = localStorage.getItem("conversation-theme");
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  setTheme(saved || (systemDark ? "dark" : "light"));
}

async function loadNotices() {
  try {
    const response = await fetch("./data/notices.json", { cache: "no-store" });
    if (!response.ok) throw new Error("notices not found");
    const notices = await response.json();
    return Array.isArray(notices) ? notices : fallbackNotices;
  } catch (error) {
    return fallbackNotices;
  }
}

function createShell() {
  const main = document.querySelector("main");
  main.className = "workspace";
  main.innerHTML = `
    <aside class="nav-tree" aria-label="기능 목록">
      <div class="tree-group">
        <p>Overview</p>
        <button class="tree-item active" type="button" data-view="overview">기본 정보</button>
        <button class="tree-item" type="button" data-view="activity">사용 흐름</button>
      </div>
      <div class="tree-group">
        <p>Explore</p>
        <button class="tree-item tree-parent" type="button" data-view="timeline" aria-expanded="false">타임라인</button>
        <div class="tree-children" data-tree-children="timeline">
          <button class="tree-item tree-child" type="button" data-view="patterns">사용패턴</button>
        </div>
        <button class="tree-item" type="button" data-view="records">기록 TOP</button>
        <button class="tree-item" type="button" data-view="inspector">대화 확인하기</button>
      </div>
      <div class="tree-group">
        <p>Breakdown</p>
        <button class="tree-item" type="button" data-view="models">모델</button>
        <button class="tree-item" type="button" data-view="topics">주제</button>
        <button class="tree-item" type="button" data-view="tools">도구</button>
      </div>
      <div class="tree-group">
        <p>Data</p>
        <button class="tree-item" type="button" data-view="notices">공지</button>
        <button class="tree-item" type="button" data-view="export">Export 구조</button>
      </div>
    </aside>

    <section class="content-stack">
      <section class="view-panel active" data-panel="overview">
        <div class="section-head">
          <div><p class="eyebrow">Overview</p><h2>기본 정보</h2></div>
          <p id="range-note"></p>
        </div>
        <div class="summary-grid" id="summary-grid" aria-label="요약"></div>
        <div class="insight-grid" id="insight-grid"></div>
        <div class="overview-operations">
          <button class="overview-nav-card" type="button" data-view="operations">
            <span>Operations</span>
            <strong>운영정보</strong>
            <p>웹 체험판, 앱 로컬 분석, 데이터 정책과 운영 방향을 확인합니다.</p>
          </button>
        </div>
      </section>

      <section class="view-panel" data-panel="operations">
        <div class="section-head">
          <div><p class="eyebrow">Operations</p><h2>정책과 운영 방향</h2></div>
          <p>웹 체험판과 앱 로컬 분석의 운영 기준입니다.</p>
        </div>
        <div class="policy-block">
          <div class="policy-grid" id="operations-grid"></div>
        </div>
        <div class="policy-block policy-block-spaced">
          <h3>정책</h3>
          <div class="policy-grid" id="policy-grid"></div>
        </div>
      </section>

      <section class="view-panel" data-panel="activity">
        <div class="section-head">
          <div><p class="eyebrow">Activity</p><h2>사용 흐름</h2></div>
          <div class="year-switcher">
            <button class="year-button" type="button" data-activity-year-step="-1" aria-label="이전 연도">‹</button>
            <strong id="activity-year">2025</strong>
            <button class="year-button" type="button" data-activity-year-step="1" aria-label="다음 연도">›</button>
          </div>
        </div>
        <div class="activity-chart" id="activity-chart" aria-label="월별 사용 흐름"></div>
        <div class="activity-table" id="activity-table"></div>
      </section>

      <section class="view-panel" data-panel="timeline">
        <div class="section-head">
          <div><p class="eyebrow">Explore</p><h2>타임라인</h2></div>
          <p id="result-count"></p>
        </div>
        <div class="calendar-wrap">
          <div class="calendar-head">
            <button class="year-button" type="button" data-year-step="-1" aria-label="이전 연도">‹</button>
            <h3 id="calendar-year">2025</h3>
            <button class="year-button" type="button" data-year-step="1" aria-label="다음 연도">›</button>
          </div>
          <div class="calendar-subhead">
            <p>시작일과 끝일을 차례로 눌러 분석할 기간을 정합니다.</p>
          </div>
          <div class="calendar-grid" id="calendar-grid"></div>
          <div class="day-detail" id="day-detail"></div>
        </div>
      </section>

      <section class="view-panel" data-panel="patterns">
        <div class="section-head">
          <div><p class="eyebrow">Timeline</p><h2>사용패턴</h2></div>
          <div class="segmented-control" aria-label="사용패턴 기준">
            <button class="segment active" type="button" data-pattern-mode="daily">일간</button>
            <button class="segment" type="button" data-pattern-mode="weekly">주간</button>
            <button class="segment" type="button" data-pattern-mode="total">전체</button>
          </div>
        </div>
        <div class="pattern-summary" id="pattern-summary"></div>
        <div class="pattern-grid" id="pattern-grid"></div>
      </section>

      <section class="view-panel" data-panel="records">
        <div class="section-head">
          <div><p class="eyebrow">Records</p><h2>기록 TOP</h2></div>
          <p>깊게 나눈 대화와 사용 피크</p>
        </div>
        <div class="list-grid" id="records-grid"></div>
      </section>

      <section class="view-panel" data-panel="inspector">
        <p class="viewer-note" id="inspector-note">타임라인 날짜나 기록 TOP의 대화를 선택하면 여기에 표시됩니다.</p>
        <div class="inspector-list" id="inspector-list"></div>
      </section>

      <section class="view-panel" data-panel="models">
        <div class="section-head">
          <div><p class="eyebrow">Models</p><h2>모델 사용 흔적</h2></div>
          <p>export의 model_slug 기준</p>
        </div>
        <div class="panel-toolbar">
          <div class="segmented-control" aria-label="모델 정렬 기준">
            <button class="segment active" type="button" data-model-sort="usage">사용량순</button>
            <button class="segment" type="button" data-model-sort="release">출시순</button>
          </div>
        </div>
        <div class="rank-list" id="model-list"></div>
      </section>

      <section class="view-panel" data-panel="topics">
        <div class="section-head">
          <div><p class="eyebrow">Topics</p><h2>주제 분포</h2></div>
          <p>제목과 일부 본문 기반 자동 태그</p>
        </div>
        <div class="rank-list" id="topic-list"></div>
      </section>

      <section class="view-panel" data-panel="tools">
        <div class="section-head">
          <div><p class="eyebrow">Tools</p><h2>도구 사용 기록</h2></div>
          <p>검색, 파일, 실행 계열 tool 메시지</p>
        </div>
        <div class="rank-list" id="tool-list"></div>
      </section>

      <section class="view-panel" data-panel="notices">
        <div class="section-head">
          <div><p class="eyebrow">Notices</p><h2>공지사항</h2></div>
          <p>Question' Trace 운영과 앱 준비 상황을 정리합니다.</p>
        </div>
        <div class="qt-notice-page" id="notice-page"></div>
      </section>

      <section class="view-panel" data-panel="export">
        <div class="section-head">
          <div><p class="eyebrow">Export Fields</p><h2>포함된 정보</h2></div>
        </div>
        <div class="field-list">
          <div><strong>대화 단위</strong><span>title, create_time, update_time, mapping, conversation_id 계열 메타데이터</span></div>
          <div><strong>메시지 단위</strong><span>id, author.role, create_time, content_type, parts/text, status, parent, children</span></div>
          <div><strong>도구 기록</strong><span>web.run, browser, python, file_search 같은 tool 메시지와 일부 실행 메타데이터</span></div>
          <div><strong>모델 흔적</strong><span>model_slug, default_model_slug, reasoning_status, request_id, turn_exchange_id</span></div>
          <div><strong>첨부 메타</strong><span>파일명, mimeType, fileSizeTokens 같은 첨부 정보. 원본 파일 내용 전체가 항상 들어있는 것은 아님</span></div>
          <div><strong>숨김 메시지</strong><span>system, developer, user profile, tool 상태처럼 화면에는 안 보이는 필드가 포함될 수 있음</span></div>
        </div>
      </section>
    </section>
  `;
}
function renderSummary(data) {
  const summary = data.summary;
  const cards = [
    ["대화", formatNumber(summary.conversationCount)],
    ["보이는 메시지", formatNumber(summary.visibleMessages)],
    ["기간", `${summary.first.slice(0, 10)} - ${summary.last.slice(0, 10)}`],
    ["원본 크기", formatBytes(summary.fileSizeBytes)],
  ];
  document.querySelector("#summary-grid").innerHTML = cards
    .map(([label, value]) => `<div class="stat-card"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
  document.querySelector("#source-note").textContent = formatDataSource(data);
  updateFilePickerLabel(formatDataSource(data));
  document.querySelector("#range-note").textContent = `${summary.messagesWithTime.toLocaleString("ko-KR")}개 메시지에 시간이 남아 있음`;

  const activeDays = new Set(data.conversations.map((conversation) => conversation.day)).size;
  const topMonth = [...data.months].sort((a, b) => b.count - a.count)[0];
  const longest = [...data.conversations].sort((a, b) => b.totalChars - a.totalChars)[0];
  const mostMessages = [...data.conversations].sort((a, b) => b.visibleCount - a.visibleCount)[0];
  document.querySelector("#insight-grid").innerHTML = [
    ["사용한 날짜", `${formatNumber(activeDays)}일`, "대화가 생성된 날짜 기준"],
    ["가장 많이 쓴 달", topMonth.month, `${formatNumber(topMonth.count)}개 대화`],
    ["가장 긴 대화", longest.title, `${formatNumber(longest.totalChars)} chars`],
    ["메시지 많은 대화", mostMessages.title, `${formatNumber(mostMessages.visibleCount)} msgs`],
  ].map(([label, value, detail]) => `
    <div class="insight-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </div>
  `).join("");

  document.querySelector("#policy-grid").innerHTML = [
    ["데모 데이터", "웹에선 사용자의 데이터를 사용하지 않습니다. 익명화/합성 데이터만을 제공해 기능을 살펴볼 수 있게 합니다."],
    ["앱", "이 웹의 기능들이 마음에 드셨다면, 앱도 와보세요. 앱에선 사용자의 데이터를 직접 넣고 확인할 수 있습니다."],
    ["민감정보 보호", "대화 전문과 장기 패턴 분석은 민감도가 높으므로 앱의 로컬 분석 기능으로 분리합니다. 사용자의 데이터는 언제든 삭제하고 공개 여부를 결정할 수 있습니다."],
  ].map(([title, detail]) => `
    <div class="policy-card">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
    </div>
  `).join("");

  document.querySelector("#operations-grid").innerHTML = [
    ["웹의 역할", "웹은 가벼운 체험, 샘플 리포트, 기능 소개, 앱으로 이어지는 진입점을 담당합니다."],
    ["앱의 역할", "앱은 전체 export 분석, 대화 전문 뷰어, 로컬 DB, 검색, 장기 사용 리포트를 담당합니다."],
    ["샘플 데이터", "웹 공개 데이터는 실제 사용자의 원본이 아니라 통계적 형태만 남긴 합성 데이터로 운영합니다."],
    ["출시 방향", "웹은 빠르게 이해시키고, 앱은 오래 머물며 깊게 분석하는 제품으로 나누어 운영합니다."],
  ].map(([title, detail]) => `
    <div class="policy-card">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
    </div>
  `).join("");
}
function renderMonthChart(data) {
  const firstYear = Number(data.summary.first.slice(0, 4));
  const lastYear = Number(data.summary.last.slice(0, 4));
  if (!state.activityYear) state.activityYear = lastYear;
  state.activityYear = Math.min(lastYear, Math.max(firstYear, state.activityYear));
  document.querySelector("#activity-year").textContent = state.activityYear;
  document.querySelector('[data-activity-year-step="-1"]').disabled = state.activityYear <= firstYear;
  document.querySelector('[data-activity-year-step="1"]').disabled = state.activityYear >= lastYear;

  const rows = Array.from({ length: 12 }, (_, index) => ({
    month: `${state.activityYear}-${String(index + 1).padStart(2, "0")}`,
    label: `${index + 1}월`,
    conversations: 0,
    messages: 0,
    chars: 0,
  }));
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  for (const conversation of data.conversations) {
    const row = byMonth.get(conversation.month);
    if (!row) continue;
    row.conversations += 1;
    row.messages += conversation.visibleCount;
    row.chars += conversation.totalChars;
  }
  renderActivityLine(rows);
  renderActivityTable(rows);
}

function renderActivityLine(rows) {
  const width = 860;
  const height = 260;
  const pad = 34;
  const max = Math.max(...rows.map((row) => row.messages), 1);
  const points = rows.map((row, index) => {
    const x = pad + (index * (width - pad * 2)) / 11;
    const y = height - pad - (row.messages / max) * (height - pad * 2);
    return { x, y, row };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  document.querySelector("#activity-chart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${state.activityYear} 월별 메시지 흐름">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" class="axis"></line>
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" class="axis"></line>
      <path d="${path}" class="activity-line"></path>
      ${points.map((point) => `
        <g data-month="${point.row.month}">
          <circle cx="${point.x}" cy="${point.y}" r="5" class="activity-dot"></circle>
          <text x="${point.x}" y="${height - 10}" text-anchor="middle">${point.row.label}</text>
          <title>${point.row.month}: ${formatNumber(point.row.messages)} messages, ${formatNumber(point.row.conversations)} conversations</title>
        </g>
      `).join("")}
    </svg>
  `;
}

function renderActivityTable(rows) {
  const peak = [...rows].sort((a, b) => b.messages - a.messages)[0];
  document.querySelector("#activity-table").innerHTML = `
    <div class="activity-table-head">
      <span>월</span>
      <span>대화 수</span>
      <span>메시지 수</span>
      <span>문자량</span>
    </div>
    ${rows.map((row) => `
      <div class="activity-table-row ${row.month === peak.month && peak.messages > 0 ? "peak-row" : ""}">
        <strong>${row.label}</strong>
        <span>${formatNumber(row.conversations)}</span>
        <span>${formatNumber(row.messages)}</span>
        <span class="chars-cell">
          ${formatNumber(row.chars)}
          ${row.month === peak.month && peak.messages > 0 ? `
            <span class="mini-peak-wrap">
              <button class="mini-peak" type="button" data-toggle-peak="${row.month}" aria-label="${row.label} 대화 확인">!</button>
              <button class="mini-peak-callout" type="button" data-inspect-month="${row.month}">어떤 대화가 있는지 확인해볼까요?</button>
            </span>
          ` : ""}
        </span>
      </div>
    `).join("")}
  `;
}

function renderTopics(data) {
  topicLabels.clear();
  for (const topic of data.topics) topicLabels.set(topic.id, topic.label);
}

function filteredItems() {
  const query = state.query.trim().toLowerCase();
  const items = state.data.conversations.filter((conversation) => {
    const topicHit = state.topic === "all" || conversation.topics.includes(state.topic);
    const textHit = !query || `${conversation.title} ${conversation.create} ${conversation.update}`.toLowerCase().includes(query);
    return topicHit && textHit;
  });
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (state.sort === "oldest") return (a.create || "").localeCompare(b.create || "");
    if (state.sort === "longest") return b.totalChars - a.totalChars;
    if (state.sort === "messages") return b.visibleCount - a.visibleCount;
    return (b.create || "").localeCompare(a.create || "");
  });
  return sorted;
}

function renderTimeline() {
  const template = document.querySelector("#conversation-template");
  const timeline = document.querySelector("#timeline");
  const items = filteredItems().slice(0, 300);
  document.querySelector("#result-count").textContent = `${formatNumber(items.length)}개 표시`;
  timeline.innerHTML = "";

  for (const item of items) {
    const node = template.content.firstElementChild.cloneNode(true);
    const day = item.create ? item.create.slice(8, 10) : "--";
    const month = item.create ? item.create.slice(0, 7) : "unknown";
    node.querySelector(".date-day").textContent = day;
    node.querySelector(".date-month").textContent = month;
    const title = node.querySelector(".conversation-title");
    title.textContent = item.title;
    node.querySelector(".meta-row").innerHTML = [
      `${item.visibleCount} msgs`,
      `${formatNumber(item.totalChars)} chars`,
      `U ${item.userMessages}`,
      `A ${item.assistantMessages}`,
      item.topics.map(topicLabel).join(" / "),
    ].map((value) => `<span>${escapeHtml(value)}</span>`).join("");

    const previewMessages = item.messages
      .filter((message) => message.preview)
      .slice(0, 12)
      .map((message) => `<div class="message"><strong>${escapeHtml(message.role)}${message.time ? ` · ${message.time.slice(11, 16)}` : ""}</strong><p>${escapeHtml(message.preview)}</p></div>`)
      .join("");
    node.querySelector(".message-preview").innerHTML = previewMessages || `<div class="message"><p>미리보기 텍스트가 없습니다.</p></div>`;
    title.addEventListener("click", () => node.classList.toggle("open"));
    timeline.appendChild(node);
  }
}

function renderCalendar() {
  const grid = document.querySelector("#calendar-grid");
  const conversationsByDay = new Map();
  const countsByDay = new Map(state.data.days.map((day) => [day.day, day.count]));
  for (const conversation of state.data.conversations) {
    if (!conversationsByDay.has(conversation.day)) conversationsByDay.set(conversation.day, []);
    conversationsByDay.get(conversation.day).push(conversation);
  }

  const first = state.data.summary.first.slice(0, 10);
  const last = state.data.summary.last.slice(0, 10);
  const minYear = Number(first.slice(0, 4));
  const maxYear = Number(last.slice(0, 4));
  if (!state.calendarYear) state.calendarYear = maxYear;
  state.calendarYear = Math.min(maxYear, Math.max(minYear, state.calendarYear));
  document.querySelector("#calendar-year").textContent = state.calendarYear;
  document.querySelector('[data-year-step="-1"]').disabled = state.calendarYear <= minYear;
  document.querySelector('[data-year-step="1"]').disabled = state.calendarYear >= maxYear;

  if (!state.selectedDay && !state.selectionCleared) {
    state.selectedDay = [...countsByDay.keys()].sort().at(-1);
  }
  if (!state.rangeStart && state.selectedDay) state.rangeStart = state.selectedDay;
  if (!state.rangeEnd && state.selectedDay) state.rangeEnd = state.selectedDay;

  grid.innerHTML = Array.from({ length: 12 }, (_, monthIndex) => {
    return renderMonthCalendar(state.calendarYear, monthIndex, first, last, countsByDay);
  }).join("");
  renderDayDetail(conversationsByDay.get(state.selectedDay) || []);
}

function renderMonthCalendar(year, monthIndex, first, last, countsByDay) {
  const monthName = `${monthIndex + 1}월`;
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  const leadingBlanks = monthStart.getDay();
  const cells = [];
  for (let index = 0; index < leadingBlanks; index += 1) {
    cells.push(`<span class="calendar-day blank"></span>`);
  }
  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = countsByDay.get(key) || 0;
    const inRange = key >= first && key <= last;
    const active = inRange && count > 0;
    const [rangeStart, rangeEnd] = normalizedRange();
    const selectedRange = rangeStart && rangeEnd && key >= rangeStart && key <= rangeEnd;
    const rangeEdge = selectedRange && (key === rangeStart || key === rangeEnd);
    const conversations = state.data.conversations
      .filter((conversation) => conversation.day === key)
      .sort((a, b) => (a.create || "").localeCompare(b.create || ""));
    cells.push(`
      <button
        class="calendar-day ${active ? "has-activity" : ""} ${key === state.selectedDay ? "selected" : ""} ${selectedRange ? "in-range" : ""} ${rangeEdge ? "range-edge" : ""}"
        type="button"
        data-day="${key}"
        ${inRange ? "" : "disabled"}
        title="${key}${active ? ` · ${count} conversations` : " · no conversations"}"
      >
        <span>${day}</span>
        ${active ? `<i>${count}</i>` : ""}
        ${active ? `
          <div class="day-hover-card" aria-hidden="true">
            ${conversations.map((conversation) => `<strong>${escapeHtml(conversation.title)}</strong>`).join("")}
          </div>
        ` : ""}
      </button>
    `);
  }
  return `
    <section class="month-card">
      <h4>${monthName}</h4>
      <div class="month-weekdays">
        <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
      </div>
      <div class="month-days">${cells.join("")}</div>
    </section>
  `;
}

function renderDayDetail(conversations) {
  const detail = document.querySelector("#day-detail");
  const sorted = [...conversations].sort((a, b) => (a.create || "").localeCompare(b.create || ""));
  detail.innerHTML = `
    <div class="day-detail-head">
      <strong>${escapeHtml(state.selectedDay || "선택한 날짜 없음")}</strong>
      <span>${formatNumber(sorted.length)} conversations</span>
    </div>
    <div class="day-conversation-list">
      ${sorted.map((conversation) => `
        <button class="day-conversation" type="button" data-open-conversation="${conversation.index}">
          <strong>${escapeHtml(conversation.title)}</strong>
          <span>${escapeHtml(conversation.create || "")} · ${formatNumber(conversation.visibleCount)} msgs · ${formatNumber(conversation.totalChars)} chars</span>
        </button>
      `).join("") || `<p class="empty-note">이 날짜에는 대화가 없습니다.</p>`}
    </div>
  `;
}

function dateFromDay(day) {
  const [year, month, date] = String(day).split("-").map(Number);
  return new Date(year, month - 1, date);
}

function dayFromDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(day, amount) {
  const date = dateFromDay(day);
  date.setDate(date.getDate() + amount);
  return dayFromDate(date);
}

function weekRange(day) {
  const date = dateFromDay(day);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  const start = dayFromDate(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function messagesOnDay(day) {
  const rows = [];
  for (const conversation of state.data.conversations) {
    for (const message of conversation.messages || []) {
      if (message.time && message.time.startsWith(day)) {
        rows.push({ ...message, conversation });
      }
    }
  }
  return rows;
}

function normalizedRange() {
  if (!state.rangeStart && !state.rangeEnd) return [null, null];
  const start = state.rangeStart || state.rangeEnd;
  const end = state.rangeEnd || state.rangeStart;
  return start <= end ? [start, end] : [end, start];
}

function daysInRange(start, end) {
  const days = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function conversationsInRange(start, end) {
  return state.data.conversations.filter((conversation) => conversation.day >= start && conversation.day <= end);
}

function messagesInRange(start, end) {
  const rows = [];
  for (const conversation of state.data.conversations) {
    for (const message of conversation.messages || []) {
      const day = message.time ? message.time.slice(0, 10) : conversation.day;
      if (day >= start && day <= end) {
        rows.push({ ...message, day, conversation });
      }
    }
  }
  return rows;
}

function renderUsagePatterns() {
  const fallbackDay = state.patternDay || state.selectedDay || state.data.days.at(-1)?.day;
  if (!state.rangeStart && !state.selectionCleared) state.rangeStart = fallbackDay;
  if (!state.rangeEnd) state.rangeEnd = state.rangeStart;
  const [start, end] = normalizedRange();
  if (!start || !end) {
    document.querySelector("#pattern-summary").innerHTML = `
      <div class="pattern-card"><span>선택 기간</span><strong>선택 없음</strong></div>
      <div class="pattern-card"><span>대화</span><strong>0</strong></div>
      <div class="pattern-card"><span>메시지</span><strong>0</strong></div>
    `;
    document.querySelector("#pattern-grid").innerHTML = `<p class="empty-note">캘린더에서 날짜를 선택하면 사용 패턴을 확인할 수 있습니다.</p>`;
    return;
  }

  document.querySelectorAll("[data-pattern-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.patternMode === state.patternMode);
  });

  if (state.patternMode === "weekly") {
    renderWeeklyRangePattern(start, end);
  } else if (state.patternMode === "total") {
    renderTotalRangePattern(start, end);
  } else {
    renderDailyRangePattern(start, end);
  }
}

function renderDailyRangePattern(start, end) {
  const conversations = conversationsInRange(start, end);
  const messages = messagesInRange(start, end);
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    label: String(hour).padStart(2, "0"),
    value: 0,
    user: 0,
    assistant: 0,
  }));

  for (const message of messages) {
    if (!message.time) continue;
    const hour = Number(message.time.slice(11, 13));
    if (!Number.isFinite(hour)) continue;
    hourly[hour].value += 1;
    if (message.role === "user") hourly[hour].user += 1;
    if (message.role === "assistant") hourly[hour].assistant += 1;
  }

  const peak = [...hourly].sort((a, b) => b.value - a.value)[0];
  renderPatternSummary(start, end, conversations.length, messages.length, peak?.value ? `${peak.label}:00` : "-");
  document.querySelector("#pattern-grid").innerHTML = `
    <section class="pattern-panel">
      <h3>24시간 사용 분포</h3>
      ${renderHourlyTickChart(hourly)}
    </section>
    <section class="pattern-panel">
      <h3>선택 기간의 대화 TOP</h3>
      ${renderRangeConversationList(conversations)}
    </section>
  `;
}

function renderHourlyTickChart(hourly, maxValue = null, compact = false) {
  const max = maxValue || Math.max(...hourly.map((row) => row.value), 1);
  return `
    <div class="hour-tick-chart ${compact ? "compact" : ""}" aria-label="24시간 사용 분포">
      <div class="hour-ticks">
        ${hourly.map((row) => {
    const ratio = row.value / max;
    const alpha = row.value ? 0.16 + ratio * 0.76 : 0;
    return `
          <div class="hour-tick" title="${row.label}:00 · ${formatNumber(row.value)} messages">
            <span style="background:${row.value ? `rgba(139, 198, 255, ${alpha.toFixed(2)})` : "transparent"}"></span>
            <i></i>
            <strong>${escapeHtml(row.label)}</strong>
            <em>${formatNumber(row.value)}</em>
          </div>
        `;
  }).join("")}
      </div>
      ${compact ? "" : `
      <div class="hour-tick-note">
        <span>색이 진할수록 해당 시간대를 더 많이 사용했습니다.</span>
        <span>user/GPT 메시지를 합산한 값입니다.</span>
      </div>
      `}
    </div>
  `;
}

function renderWeeklyRangePattern(start, end) {
  const selectedDays = daysInRange(start, end);
  const conversations = conversationsInRange(start, end);
  const messages = messagesInRange(start, end);
  const rows = selectedDays.map((day) => ({
    day,
    label: day.slice(5),
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      label: String(hour).padStart(2, "0"),
      value: 0,
    })),
  }));

  for (const message of messages) {
    const row = rows.find((item) => item.day === message.day);
    if (!row || !message.time) continue;
    const hour = Number(message.time.slice(11, 13));
    if (!Number.isFinite(hour)) continue;
    row.hourly[hour].value += 1;
  }

  const peak = [...rows].sort((a, b) => {
    const aTotal = a.hourly.reduce((sum, item) => sum + item.value, 0);
    const bTotal = b.hourly.reduce((sum, item) => sum + item.value, 0);
    return bTotal - aTotal;
  })[0];
  renderPatternSummary(start, end, conversations.length, messages.length, peak?.label || "-");
  document.querySelector("#pattern-grid").innerHTML = `
    <section class="pattern-panel">
      <h3>주간 시간대 분포</h3>
      ${renderWeeklyTickCharts(rows)}
    </section>
    <section class="pattern-panel">
      <h3>선택 기간의 대화 TOP</h3>
      ${renderRangeConversationList(conversations)}
    </section>
  `;
}

function renderWeeklyTickCharts(rows) {
  const max = Math.max(...rows.flatMap((row) => row.hourly.map((hour) => hour.value)), 1);
  return `
    <div class="weekly-tick-charts">
      ${rows.map((row) => `
        <div class="weekly-tick-row">
          <strong>${escapeHtml(row.label)}</strong>
          ${renderHourlyTickChart(row.hourly, max, true)}
        </div>
      `).join("")}
    </div>
  `;
}

function renderTotalRangePattern(start, end) {
  const conversations = conversationsInRange(start, end);
  const messages = messagesInRange(start, end);
  const roleCounts = new Map();
  const modelCounts = new Map();
  for (const message of messages) {
    addCount(roleCounts, roleName(message.role));
    if (message.model) addCount(modelCounts, message.model);
  }
  renderPatternSummary(start, end, conversations.length, messages.length, `${formatNumber(conversations.reduce((sum, conversation) => sum + conversation.totalChars, 0))} chars`);
  document.querySelector("#pattern-grid").innerHTML = `
    <section class="pattern-panel">
      <h3>전체 사용량</h3>
      ${renderVerticalLineChart([
    { label: "대화", value: conversations.length, meta: "conversations" },
    { label: "메시지", value: messages.length, meta: "messages" },
    { label: "user", value: roleCounts.get("user") || 0, meta: "user messages" },
    { label: "GPT", value: roleCounts.get("GPT") || 0, meta: "assistant messages" },
  ])}
      <div class="pattern-bars">
        ${[...modelCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([model, value]) => `
          <div class="pattern-row"><span>${escapeHtml(model)}</span><i><b style="width:${Math.max(2, Math.round((value / Math.max(...modelCounts.values(), 1)) * 100))}%"></b></i><strong>${formatNumber(value)}</strong><em>model traces</em></div>
        `).join("") || `<p class="empty-note">모델 기록이 없습니다.</p>`}
      </div>
    </section>
    <section class="pattern-panel">
      <h3>선택 기간의 대화 TOP</h3>
      ${renderRangeConversationList(conversations)}
    </section>
  `;
}

function renderPatternSummary(start, end, conversationCount, messageCount, peakLabel) {
  document.querySelector("#pattern-summary").innerHTML = `
    <div class="pattern-card"><span>선택 기간</span><strong>${escapeHtml(start)} - ${escapeHtml(end)}</strong></div>
    <div class="pattern-card"><span>대화</span><strong>${formatNumber(conversationCount)}</strong></div>
    <div class="pattern-card"><span>메시지</span><strong>${formatNumber(messageCount)}</strong></div>
    <div class="pattern-card"><span>피크</span><strong>${escapeHtml(peakLabel)}</strong></div>
  `;
}

function textFromLocalContent(content) {
  if (!content || typeof content !== "object") return "";
  if (Array.isArray(content.parts)) {
    return content.parts.map((part) => (typeof part === "string" ? part : "")).join("\n");
  }
  if (typeof content.text === "string") return content.text;
  if (typeof content.result === "string") return content.result;
  return "";
}

function toLocalKstIso(seconds) {
  if (!seconds) return null;
  return new Date(Number(seconds) * 1000 + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

function detectLocalTopics(text) {
  const lower = String(text || "").toLowerCase();
  const hits = localTopicRules
    .filter((topic) => topic.keys.some((key) => lower.includes(key.toLowerCase())))
    .map((topic) => topic.id);
  return hits.length ? hits : ["other"];
}

function localMessageSummary(message) {
  const content = message.content || {};
  const text = textFromLocalContent(content).trim();
  const metadata = message.metadata || {};
  const role = message.author?.role || "unknown";
  return {
    id: `local-${message.id || Math.random().toString(36).slice(2)}`,
    role,
    name: message.author?.name || null,
    time: toLocalKstIso(message.create_time),
    contentType: content.content_type || "text",
    hidden: metadata.is_visually_hidden_from_conversation === true,
    model: metadata.model_slug || null,
    textLength: text.length,
    text,
    preview: text.replace(/\s+/g, " ").slice(0, 180),
  };
}

function normalizeLocalData(raw, file) {
  if (raw?.summary && Array.isArray(raw.conversations)) {
    const isSampleFile = /sample/i.test(file?.name || raw.sourceFile || "");
    return {
      ...raw,
      sourceKind: isSampleFile ? "sample" : "local",
      sourceFile: isSampleFile ? "sample.json" : "Local Conversation",
      timezone: raw.timezone || "Asia/Seoul",
    };
  }
  if (!Array.isArray(raw)) {
    throw new Error("지원하지 않는 JSON 구조입니다. ChatGPT conversations export 또는 timeline JSON을 선택해주세요.");
  }

  const months = new Map();
  const days = new Map();
  const roles = new Map();
  const visibleRoles = new Map();
  const models = new Map();
  const tools = new Map();
  const contentTypes = new Map();
  const topicCounts = new Map();
  let totalMessages = 0;
  let visibleMessages = 0;
  let messagesWithTime = 0;
  let first = null;
  let last = null;

  const conversations = raw.map((conversation, index) => {
    const create = toLocalKstIso(conversation.create_time);
    const update = toLocalKstIso(conversation.update_time) || create;
    if (create && (!first || create < first)) first = create;
    if (update && (!last || update > last)) last = update;
    const day = create ? create.slice(0, 10) : "unknown";
    const month = create ? create.slice(0, 7) : "unknown";
    addCount(months, month);
    addCount(days, day);

    const topicText = [conversation.title || ""];
    let visibleCount = 0;
    let userMessages = 0;
    let assistantMessages = 0;
    let toolMessages = 0;
    let systemMessages = 0;
    let userChars = 0;
    let assistantChars = 0;
    const messages = [];

    for (const node of Object.values(conversation.mapping || {})) {
      const message = node?.message;
      if (!message) continue;
      totalMessages += 1;
      if (message.create_time) messagesWithTime += 1;
      const summary = localMessageSummary(message);
      addCount(roles, summary.role);
      addCount(contentTypes, summary.contentType);
      if (summary.model) addCount(models, summary.model);
      if (summary.role === "tool") addCount(tools, summary.name || "tool");
      if (!summary.hidden) {
        visibleMessages += 1;
        visibleCount += 1;
        addCount(visibleRoles, summary.role);
        messages.push(summary);
      }
      if (summary.role === "user") {
        userMessages += 1;
        userChars += summary.textLength;
        if (summary.text) topicText.push(summary.text.slice(0, 1000));
      } else if (summary.role === "assistant") {
        assistantMessages += 1;
        assistantChars += summary.textLength;
      } else if (summary.role === "tool") {
        toolMessages += 1;
      } else if (summary.role === "system") {
        systemMessages += 1;
      }
    }

    messages.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const topics = detectLocalTopics(topicText.join(" "));
    for (const topic of topics) addCount(topicCounts, topic);
    return {
      index,
      title: conversation.title || "(Untitled)",
      create,
      update,
      day,
      month,
      topics,
      nodeCount: Object.keys(conversation.mapping || {}).length,
      visibleCount,
      userMessages,
      assistantMessages,
      toolMessages,
      systemMessages,
      userChars,
      assistantChars,
      totalChars: userChars + assistantChars,
      messages,
    };
  }).filter((conversation) => conversation.create);

  conversations.sort((a, b) => (b.create || "").localeCompare(a.create || ""));
  conversations.forEach((conversation, index) => { conversation.index = index; });

  return {
    generatedAt: new Date().toISOString(),
    sourceKind: "local",
    sourceFile: "Local Conversation",
    sourceName: file?.name || "local file",
    timezone: "Asia/Seoul",
    summary: {
      fileSizeBytes: file?.size || 0,
      conversationCount: conversations.length,
      totalMessages,
      visibleMessages,
      messagesWithTime,
      first,
      last,
      roles: sortedCounts(roles),
      visibleRoles: sortedCounts(visibleRoles),
      models: sortedCounts(models).slice(0, 20),
      tools: sortedCounts(tools).slice(0, 30),
      contentTypes: sortedCounts(contentTypes).slice(0, 20),
      topics: sortedCounts(topicCounts),
      attachments: [],
    },
    months: [...months.entries()].map(([month, count]) => ({ month, count })).sort((a, b) => a.month.localeCompare(b.month)),
    days: [...days.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)),
    topics: localTopicRules.concat([{ id: "other", label: "Other" }]).map(({ id, label }) => ({ id, label })),
    conversations,
  };
}

function resetDashboardData(data) {
  state.data = data;
  state.topic = "all";
  state.query = "";
  state.sort = "newest";
  state.modelSort = "usage";
  state.selectedDay = null;
  state.calendarYear = null;
  state.activityYear = null;
  state.patternDay = null;
  state.rangeStart = null;
  state.rangeEnd = null;
  state.rangePending = false;
  state.selectionCleared = false;
  state.inspectMonth = null;
  state.inspectedIndexes = [];
  state.selectedConversationIndex = null;
  renderSummary(state.data);
  renderMonthChart(state.data);
  renderTopics(state.data);
  renderCalendar();
  renderUsagePatterns();
  renderRecords(state.data);
  renderBreakdowns(state.data);
  setView("overview");
}

function renderRangeConversationList(conversations) {
  return `
    <div class="day-conversation-list">
      ${[...conversations]
    .sort((a, b) => b.visibleCount - a.visibleCount)
    .slice(0, 12)
    .map((conversation) => `
        <button class="day-conversation" type="button" data-open-conversation="${conversation.index}">
          <strong>${escapeHtml(conversation.title)}</strong>
          <span>${escapeHtml(conversation.create || "")} · ${formatNumber(conversation.visibleCount)} msgs</span>
        </button>
      `).join("") || `<p class="empty-note">선택한 기간에는 대화가 없습니다.</p>`}
    </div>
  `;
}

function renderVerticalLineChart(rows) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return `
    <div class="line-marker-chart">
      ${rows.map((row) => {
    const ratio = row.value / max;
    const height = Math.max(8, Math.round(24 + ratio * 132));
    const alpha = row.value ? 0.2 + ratio * 0.7 : 0.08;
    return `
        <div class="line-marker" title="${escapeHtml(row.label)} · ${formatNumber(row.value)}">
          <div class="line-marker-track">
            <span style="height:${height}px; background:rgba(139, 198, 255, ${alpha.toFixed(2)})"></span>
            <b style="background:rgba(139, 198, 255, ${Math.min(0.95, alpha + 0.12).toFixed(2)})"></b>
          </div>
          <strong>${formatNumber(row.value)}</strong>
          <em>${escapeHtml(row.label)}</em>
          <small>${escapeHtml(row.meta || "")}</small>
        </div>
      `;
  }).join("")}
    </div>
  `;
}

function renderDailyPattern(day) {
  const messages = messagesOnDay(day);
  const conversations = state.data.conversations.filter((conversation) => conversation.day === day);
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    label: `${String(hour).padStart(2, "0")}:00`,
    value: 0,
    user: 0,
    assistant: 0,
  }));

  for (const message of messages) {
    const hour = Number(message.time.slice(11, 13));
    if (!Number.isFinite(hour)) continue;
    hourly[hour].value += 1;
    if (message.role === "user") hourly[hour].user += 1;
    if (message.role === "assistant") hourly[hour].assistant += 1;
  }

  const peak = [...hourly].sort((a, b) => b.value - a.value)[0];
  document.querySelector("#pattern-summary").innerHTML = `
    <div class="pattern-card"><span>기준 날짜</span><strong>${escapeHtml(day)}</strong></div>
    <div class="pattern-card"><span>대화</span><strong>${formatNumber(conversations.length)}</strong></div>
    <div class="pattern-card"><span>메시지</span><strong>${formatNumber(messages.length)}</strong></div>
    <div class="pattern-card"><span>피크 시간</span><strong>${peak.value ? escapeHtml(peak.label) : "-"}</strong></div>
  `;
  document.querySelector("#pattern-grid").innerHTML = `
    <section class="pattern-panel">
      <h3>일간 시간대</h3>
      ${renderDailyDensityBar(hourly)}
    </section>
    <section class="pattern-panel">
      <h3>그날의 대화</h3>
      <div class="day-conversation-list">
        ${conversations
    .sort((a, b) => (a.create || "").localeCompare(b.create || ""))
    .map((conversation) => `
          <button class="day-conversation" type="button" data-open-conversation="${conversation.index}">
            <strong>${escapeHtml(conversation.title)}</strong>
            <span>${escapeHtml(conversation.create || "")} · ${formatNumber(conversation.visibleCount)} msgs</span>
          </button>
        `).join("") || `<p class="empty-note">이 날짜에는 대화가 없습니다.</p>`}
      </div>
    </section>
  `;
}

function renderDailyDensityBar(hourly) {
  const max = Math.max(...hourly.map((row) => row.value), 1);
  return `
    <div class="density-wrap">
      <div class="density-strip" aria-label="24시간 사용 분포">
        ${hourly.map((row, hour) => {
    const alpha = row.value ? 0.18 + (row.value / max) * 0.72 : 0;
    return `
          <button
            class="density-cell"
            type="button"
            title="${String(hour).padStart(2, "0")}:00 · ${formatNumber(row.value)} messages"
            style="background:${row.value ? `rgba(139, 198, 255, ${alpha.toFixed(2)})` : "#eef1ee"}"
          >
            <span>${String(hour).padStart(2, "0")}</span>
          </button>
        `;
  }).join("")}
      </div>
      <div class="density-labels">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
      <div class="density-detail">
        ${hourly.map((row) => `
          <div>
            <strong>${escapeHtml(row.label)}</strong>
            <span>${formatNumber(row.value)} msgs · ${formatNumber(row.user)} user · ${formatNumber(row.assistant)} GPT</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderWeeklyPattern(day) {
  const days = weekRange(day);
  const daySet = new Set(days);
  const rows = days.map((item) => ({
    label: item.slice(5),
    day: item,
    conversations: state.data.conversations.filter((conversation) => conversation.day === item),
    messages: messagesOnDay(item),
  }));
  const weekConversations = state.data.conversations.filter((conversation) => daySet.has(conversation.day));
  const weekMessages = rows.reduce((sum, row) => sum + row.messages.length, 0);
  const peak = [...rows].sort((a, b) => b.messages.length - a.messages.length)[0];

  document.querySelector("#pattern-summary").innerHTML = `
    <div class="pattern-card"><span>기준 주간</span><strong>${escapeHtml(days[0])} - ${escapeHtml(days[6])}</strong></div>
    <div class="pattern-card"><span>대화</span><strong>${formatNumber(weekConversations.length)}</strong></div>
    <div class="pattern-card"><span>메시지</span><strong>${formatNumber(weekMessages)}</strong></div>
    <div class="pattern-card"><span>피크 날짜</span><strong>${peak.messages.length ? escapeHtml(peak.day) : "-"}</strong></div>
  `;
  document.querySelector("#pattern-grid").innerHTML = `
    <section class="pattern-panel">
      <h3>二쇨컙 ?먮쫫</h3>
      ${renderPatternBars(rows.map((row) => ({
        label: row.label,
        value: row.messages.length,
        meta: `${formatNumber(row.conversations.length)} conversations`,
      })))}
    </section>
    <section class="pattern-panel">
      <h3>주간 대화 TOP</h3>
      <div class="day-conversation-list">
        ${weekConversations
    .sort((a, b) => b.visibleCount - a.visibleCount)
    .slice(0, 12)
    .map((conversation) => `
          <button class="day-conversation" type="button" data-open-conversation="${conversation.index}">
            <strong>${escapeHtml(conversation.title)}</strong>
            <span>${escapeHtml(conversation.create || "")} · ${formatNumber(conversation.visibleCount)} msgs</span>
          </button>
        `).join("") || `<p class="empty-note">이 주에는 대화가 없습니다.</p>`}
      </div>
    </section>
  `;
}

function renderPatternBars(rows) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return `
    <div class="pattern-bars">
      ${rows.map((row) => `
        <div class="pattern-row">
          <span>${escapeHtml(row.label)}</span>
          <i><b style="width:${Math.max(2, Math.round((row.value / max) * 100))}%"></b></i>
          <strong>${formatNumber(row.value)}</strong>
          <em>${escapeHtml(row.meta)}</em>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRankList(selector, items, labelKey = "key", valueKey = "value") {
  const max = Math.max(...items.map((item) => item[valueKey]), 1);
  document.querySelector(selector).innerHTML = items.map((item) => {
    const label = labelKey === "topic" ? topicLabel(item[labelKey]) : item[labelKey];
    const value = item[valueKey];
    const width = Math.max(2, Math.round((value / max) * 100));
    return `
      <div class="rank-row">
        <div><strong>${escapeHtml(label)}</strong><span>${formatNumber(value)}</span></div>
        <i style="width:${width}%"></i>
      </div>
    `;
  }).join("");
}

function modelInfo(slug) {
  const rules = [
    [/^gpt-5-2-thinking$/, 112, "최신", "GPT-5.2 thinking"],
    [/^gpt-5-2$/, 110, "최신", "GPT-5.2"],
    [/^gpt-5-1-thinking$/, 104, "최근", "GPT-5.1 thinking"],
    [/^gpt-5-1$/, 102, "최근", "GPT-5.1"],
    [/^gpt-5-auto-thinking$/, 98, "최근", "GPT-5 auto thinking"],
    [/^gpt-5-thinking$/, 96, "최근", "GPT-5 thinking"],
    [/^gpt-5-t-mini$/, 94, "최근", "GPT-5 mini"],
    [/^gpt-5$/, 92, "최근", "GPT-5"],
    [/^o3-mini-high$/, 84, "이전", "o3 mini high"],
    [/^o3-mini$/, 82, "이전", "o3 mini"],
    [/^o3$/, 80, "이전", "o3"],
    [/^gpt-4-5$/, 74, "이전", "GPT-4.5"],
    [/^o1-preview$/, 68, "이전", "o1 preview"],
    [/^o1$/, 66, "이전", "o1"],
    [/^gpt-4o-canmore$/, 58, "이전", "GPT-4o canmore"],
    [/^gpt-4o-jawbone$/, 56, "이전", "GPT-4o jawbone"],
    [/^gpt-4o-mini$/, 54, "이전", "GPT-4o mini"],
    [/^gpt-4o$/, 52, "이전", "GPT-4o"],
    [/^gpt-4$/, 42, "레거시", "GPT-4"],
    [/^text-davinci-002-render-sha$/, 20, "레거시", "legacy ChatGPT render slug"],
    [/^text-davinci/, 18, "레거시", "legacy text-davinci"],
  ];
  for (const [pattern, rank, era, family] of rules) {
    if (pattern.test(slug)) return { rank, era, family };
  }
  return { rank: 1, era: "미분류", family: "알 수 없는 export slug" };
}

function renderModelList() {
  const models = state.data.summary.models.map((model) => ({
    ...model,
    ...modelInfo(model.key),
  }));
  const sorted = [...models].sort((a, b) => {
    if (state.modelSort === "release") {
      return b.rank - a.rank || b.value - a.value || a.key.localeCompare(b.key);
    }
    return b.value - a.value || b.rank - a.rank || a.key.localeCompare(b.key);
  });

  const max = Math.max(...models.map((model) => model.value), 1);
  document.querySelector("#model-list").innerHTML = sorted.map((model) => {
    const width = Math.max(2, Math.round((model.value / max) * 100));
    return `
      <div class="rank-row model-usage-row">
        <div>
          <strong>${escapeHtml(model.key)}</strong>
          <span>${formatNumber(model.value)} traces</span>
        </div>
        <i style="width:${width}%"></i>
      </div>
    `;
  }).join("");
}

function renderRecords(data) {
  const longest = [...data.conversations].sort((a, b) => b.totalChars - a.totalChars).slice(0, 10);
  const mostMessages = [...data.conversations].sort((a, b) => b.visibleCount - a.visibleCount).slice(0, 10);
  document.querySelector("#records-grid").innerHTML = `
    ${renderMiniList("긴 대화", longest.map((item) => [item.title, `${formatNumber(item.totalChars)} chars · ${item.create}`, item.index]))}
    ${renderMiniList("메시지 많은 대화", mostMessages.map((item) => [item.title, `${formatNumber(item.visibleCount)} msgs · ${item.create}`, item.index]))}
  `;
  renderConversationInspector();
}

function renderConversationInspector() {
  const note = document.querySelector("#inspector-note");
  const list = document.querySelector("#inspector-list");
  if (!state.inspectMonth && state.selectedConversationIndex == null && !state.inspectedIndexes.length) {
    note.textContent = "타임라인 날짜나 기록 TOP의 대화를 선택하면 여기에 표시됩니다.";
    list.innerHTML = `<p class="empty-note">아직 선택한 대화가 없습니다.</p>`;
    return;
  }
  const rows = state.inspectMonth
    ? state.data.conversations
      .filter((conversation) => conversation.month === state.inspectMonth)
      .sort((a, b) => b.visibleCount - a.visibleCount)
    : state.inspectedIndexes
      .map((index) => state.data.conversations.find((conversation) => conversation.index === index))
      .filter(Boolean);
  if (rows.length && !rows.some((conversation) => conversation.index === state.selectedConversationIndex)) {
    state.selectedConversationIndex = rows[0].index;
  }
  note.textContent = state.inspectMonth
    ? `${state.inspectMonth} · ${formatNumber(rows.length)} conversations`
    : `${formatNumber(rows.length)}개 대화를 모아보는 중`;
  const selected = state.data.conversations.find((conversation) => conversation.index === state.selectedConversationIndex);
  list.innerHTML = `
    <div class="inspector-cards">
      ${rows.map((conversation) => `
    <button class="inspector-card ${conversation.index === state.selectedConversationIndex ? "active" : ""}" type="button" data-conversation-index="${conversation.index}">
      <strong>${escapeHtml(conversation.title)}</strong>
      <p>${escapeHtml(conversation.create || "")}</p>
      <div>
        <span>${formatNumber(conversation.visibleCount)} msgs</span>
        <span>${formatNumber(conversation.totalChars)} chars</span>
      </div>
    </button>
      `).join("") || `<p class="empty-note">이 조건에 맞는 대화가 없습니다.</p>`}
    </div>
    ${selected ? renderConversationReader(selected) : ""}
  `;
}

function renderConversationReader(conversation) {
  const messages = (conversation.messages || []).filter((message) => message.text || message.preview);
  return `
    <section class="conversation-reader">
      <div class="browser-chrome">
        <span></span><span></span><span></span>
        <p>${escapeHtml(conversation.title)}</p>
      </div>
      <div class="reader-head">
        <div>
          <p class="eyebrow">Conversation</p>
          <h3>${escapeHtml(conversation.title)}</h3>
        </div>
        <span>${formatNumber(messages.length)} shown messages</span>
      </div>
      <div class="reader-messages">
        ${messages.map((message) => {
          const role = message.role || "unknown";
          return `
          <article class="reader-message ${escapeHtml(role)}">
            <div class="message-label">${escapeHtml(roleName(role))}${message.time ? ` · ${escapeHtml(message.time)}` : ""}</div>
            <div class="message-bubble">${renderMarkdown(message.text || message.preview)}</div>
          </article>
        `;
        }).join("") || `<p class="empty-note">표시할 메시지가 없습니다.</p>`}
      </div>
    </section>
  `;
}

function renderMiniList(title, rows) {
  return `
    <div class="mini-list">
      <h3>${escapeHtml(title)}</h3>
      ${rows.map(([name, value, index]) => `
        <button class="mini-row" type="button" ${index != null ? `data-open-conversation="${index}"` : ""}>
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(value)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function openConversation(index, options = {}) {
  const conversationIndex = Number(index);
  state.selectedConversationIndex = conversationIndex;
  state.inspectMonth = options.month || null;
  if (!state.inspectedIndexes.includes(conversationIndex)) {
    state.inspectedIndexes = [conversationIndex, ...state.inspectedIndexes];
  }
  renderConversationInspector();
  setView("inspector");
}

function renderBreakdowns(data) {
  renderModelList();
  renderRankList("#tool-list", data.summary.tools);
  renderRankList("#topic-list", data.summary.topics.map((topic) => ({ topic: topic.key, value: topic.value })), "topic");
}

function renderNotices() {
  const root = document.querySelector("#notice-page");
  if (!root) return;

  const notices = state.notices || [];
  if (!notices.length) {
    root.innerHTML = `<p class="empty-note">등록된 공지가 없습니다.</p>`;
    return;
  }

  root.innerHTML = `
    <div class="qt-notice-list">
      ${notices.map((notice, index) => `
        <article class="qt-notice-card ${index === 0 ? "featured" : ""} ${state.selectedNoticeId === notice.id ? "open" : ""}">
          <button class="qt-notice-trigger" type="button" data-notice-id="${escapeHtml(notice.id || "")}">
            <time>${escapeHtml(notice.date || "")}</time>
            <h3>${escapeHtml(notice.title || "")}</h3>
            <span>${state.selectedNoticeId === notice.id ? "공지 닫기" : "공지 읽기"}</span>
          </button>
          ${state.selectedNoticeId === notice.id ? `
            <div class="qt-notice-body">
              <p>${escapeHtml(notice.body || "").replace(/\n/g, "<br>")}</p>
              ${notice.short_title ? `<strong class="qt-notice-tag">${escapeHtml(notice.short_title)}</strong>` : ""}
            </div>
          ` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function setView(view) {
  state.view = view;
  const timelineOpen = view === "timeline" || view === "patterns";
  document.querySelectorAll(".tree-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll("[data-tree-children='timeline']").forEach((branch) => {
    branch.classList.toggle("open", timelineOpen);
  });
  document.querySelectorAll(".tree-parent[data-view='timeline']").forEach((button) => {
    button.setAttribute("aria-expanded", String(timelineOpen));
    button.classList.toggle("branch-active", timelineOpen && view !== "timeline");
  });
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === view);
  });
}

function bindEvents() {
  document.querySelector("#theme-toggle")?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });

  document.querySelector("#local-data-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const note = document.querySelector("#source-note");
    try {
      note.textContent = "loading...";
      const raw = JSON.parse(await file.text());
      const nextData = normalizeLocalData(raw, file);
      resetDashboardData(nextData);
      const label = formatDataSource(nextData);
      note.textContent = label;
      updateFilePickerLabel(label);
    } catch (error) {
      note.textContent = "sample.json";
      updateFilePickerLabel("sample.json");
      alert(`데이터를 열 수 없습니다\n${error}`);
    }
  });
  document.querySelector(".nav-tree").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    setView(button.dataset.view);
  });

  document.querySelector("#title-home")?.addEventListener("click", () => {
    setView("overview");
  });

  document.querySelector(".content-stack").addEventListener("click", (event) => {
    const button = event.target.closest(".overview-nav-card[data-view]");
    if (!button) return;
    setView(button.dataset.view);
  });

  document.querySelector("#calendar-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-day]");
    if (!button || button.disabled) return;
    const day = button.dataset.day;
    const [currentStart, currentEnd] = normalizedRange();
    const clickedSelectedRange = currentStart && currentEnd && day >= currentStart && day <= currentEnd;
    const clickedPendingStart = state.rangePending && day === state.rangeStart;

    if (clickedSelectedRange && (!state.rangePending || clickedPendingStart)) {
      state.selectedDay = null;
      state.patternDay = null;
      state.rangeStart = null;
      state.rangeEnd = null;
      state.rangePending = false;
      state.selectionCleared = true;
      renderCalendar();
      renderUsagePatterns();
      return;
    }

    state.selectionCleared = false;
    state.selectedDay = day;
    state.patternDay = day;

    if (!state.rangePending) {
      state.rangeStart = day;
      state.rangeEnd = day;
      state.rangePending = true;
    } else {
      state.rangeEnd = day;
      state.rangePending = false;
    }

    renderCalendar();
    renderUsagePatterns();
  });

  document.querySelector("#day-detail").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-conversation]");
    if (!button) return;
    openConversation(button.dataset.openConversation);
  });

  document.querySelector('[data-panel="patterns"]').addEventListener("click", (event) => {
    const modeButton = event.target.closest("[data-pattern-mode]");
    if (modeButton) {
      state.patternMode = modeButton.dataset.patternMode;
      renderUsagePatterns();
      return;
    }

    const conversationButton = event.target.closest("[data-open-conversation]");
    if (!conversationButton) return;
    openConversation(conversationButton.dataset.openConversation);
  });

  document.querySelector(".calendar-head").addEventListener("click", (event) => {
    const button = event.target.closest("[data-year-step]");
    if (!button || button.disabled) return;
    state.calendarYear += Number(button.dataset.yearStep);
    renderCalendar();
  });

  document.querySelector(".year-switcher").addEventListener("click", (event) => {
    const button = event.target.closest("[data-activity-year-step]");
    if (!button || button.disabled) return;
    state.activityYear += Number(button.dataset.activityYearStep);
    renderMonthChart(state.data);
  });

  document.querySelector("#activity-chart").addEventListener("click", (event) => {
    const button = event.target.closest("[data-inspect-month]");
    if (!button) return;
    state.inspectMonth = button.dataset.inspectMonth;
    renderConversationInspector();
    setView("inspector");
  });

  document.querySelector("#activity-table").addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-peak]");
    if (toggle) {
      const wrap = toggle.closest(".mini-peak-wrap");
      wrap.classList.toggle("open");
      return;
    }
    const button = event.target.closest("[data-inspect-month]");
    if (!button) return;
    state.inspectMonth = button.dataset.inspectMonth;
    state.selectedConversationIndex = null;
    renderConversationInspector();
    setView("inspector");
  });

  document.querySelector("#records-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-conversation]");
    if (!button) return;
    openConversation(button.dataset.openConversation);
  });

  document.querySelector("#inspector-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-conversation-index]");
    if (!button) return;
    state.selectedConversationIndex = Number(button.dataset.conversationIndex);
    renderConversationInspector();
  });

  document.querySelector('[data-panel="models"] .segmented-control').addEventListener("click", (event) => {
    const button = event.target.closest("[data-model-sort]");
    if (!button) return;
    state.modelSort = button.dataset.modelSort;
    document.querySelectorAll("[data-model-sort]").forEach((item) => {
      item.classList.toggle("active", item.dataset.modelSort === state.modelSort);
    });
    renderModelList();
  });

  document.querySelector("#notice-page")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-notice-id]");
    if (!button) return;
    state.selectedNoticeId = state.selectedNoticeId === button.dataset.noticeId ? null : button.dataset.noticeId;
    renderNotices();
  });
}

async function boot() {
  if (!window.timelineData) {
    throw new Error("timeline data is missing. Run: node timeline-dashboard/scripts/build-data.js");
  }
  state.data = window.timelineData;
  createShell();
  state.notices = await loadNotices();
  initTheme();
  renderSummary(state.data);
  renderMonthChart(state.data);
  renderTopics(state.data);
  renderCalendar();
  renderUsagePatterns();
  renderRecords(state.data);
  renderBreakdowns(state.data);
  renderNotices();
  bindEvents();
}

boot().catch((error) => {
  document.body.innerHTML = `<main><section class="band"><h1>데이터를 열 수 없습니다</h1><p>${escapeHtml(String(error))}</p></section></main>`;
});
