const STORAGE_KEY = "auto-parts-review-state-v1";

const state = {
  reviewer: "",
  startRow: 2,
  batchSize: 100,
  currentId: null,
  theme: "light",
  reviews: {},
};

const baseEditableFields = [
  "company", "part", "topic", "source_type", "publisher", "author", "published_date",
  "final_doc_id", "year_exception_reason", "text_extract_status", "chunk_count",
  "hold_reason", "fail_reason", "notes"
];

const checkboxFields = [
  "language_verified", "part_relevance_verified", "topic_relevance_verified",
  "access_verified", "source_verified", "not_duplicate_verified"
];

const $ = (id) => document.getElementById(id);

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
  } catch {
    alert("저장된 상태를 읽지 못했습니다. 새 상태로 시작합니다.");
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyTheme() {
  const selected = state.theme || "light";
  const effective = selected === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : selected;
  document.documentElement.dataset.theme = effective;
  const select = $("themeSelect");
  if (select) select.value = selected;
}

function batchCandidates() {
  const start = Number(state.startRow || 2);
  const end = start + Number(state.batchSize || 100) - 1;
  return CANDIDATES.filter((c) => Number(c.source_row) >= start && Number(c.source_row) <= end);
}

function currentCandidate() {
  return CANDIDATES.find((c) => c.candidate_id === state.currentId) || batchCandidates()[0] || CANDIDATES[0];
}

function defaultReview(candidate) {
  return {
    candidate_id: candidate.candidate_id,
    source_row: candidate.source_row,
    review_status: "pending",
    reviewer: "",
    reviewed_at: "",
    decision_reason: "",
    hold_reason: "",
    fail_reason: "",
    notes: "",
    language_verified: false,
    part_relevance_verified: false,
    topic_relevance_verified: false,
    access_verified: candidate.access_hint === "원문접근가능",
    source_verified: false,
    not_duplicate_verified: false,
    duplicate_status: "미확인",
    final_doc_id: "",
    company: candidate.company,
    part: candidate.part,
    topic: candidate.topic,
    source_type: candidate.source_type,
    publisher: candidate.venue,
    author: candidate.author,
    published_date: candidate.published_date || candidate.document_year,
    year_exception_reason: "",
    text_extract_status: "미확인",
    chunk_count: "",
  };
}

function reviewFor(candidate) {
  if (!state.reviews[candidate.candidate_id]) {
    state.reviews[candidate.candidate_id] = defaultReview(candidate);
  }
  return state.reviews[candidate.candidate_id];
}

function setCurrent(candidateId) {
  state.currentId = candidateId;
  saveState();
  render();
}

function statusLabel(status) {
  return { pending: "미검토", pass: "통과", hold: "보류", fail: "탈락" }[status] || "미검토";
}

function statusClass(status) {
  return status === "pass" ? "pass" : status === "hold" ? "hold" : status === "fail" ? "fail" : "";
}

function mark(status) {
  const candidate = currentCandidate();
  const review = reviewFor(candidate);
  syncFormToReview(review);
  review.review_status = status;
  review.reviewer = state.reviewer || review.reviewer;
  review.reviewed_at = new Date().toISOString();
  review.decision_reason = statusLabel(status);
  if (status === "fail" && !review.fail_reason) review.fail_reason = "필수 조건 미충족";
  if (status === "hold" && !review.hold_reason) review.hold_reason = "추가 확인 필요";
  saveState();
  moveToNextPending();
  render();
}

function syncFormToReview(review) {
  baseEditableFields.forEach((field) => {
    const el = document.querySelector(`[data-field="${field}"]`);
    if (el) review[field] = el.value;
  });
  checkboxFields.forEach((field) => {
    const el = document.querySelector(`[data-field="${field}"]`);
    if (el) review[field] = el.checked;
  });
}

function syncReviewToForm(candidate, review) {
  baseEditableFields.forEach((field) => {
    const el = document.querySelector(`[data-field="${field}"]`);
    if (el) el.value = review[field] ?? "";
  });
  checkboxFields.forEach((field) => {
    const el = document.querySelector(`[data-field="${field}"]`);
    if (el) el.checked = Boolean(review[field]);
  });
}

function renderStats() {
  const list = batchCandidates();
  const counts = Counter(list.map((c) => reviewFor(c).review_status));
  const companyCounts = Counter(list.map((c) => c.company));
  $("stats").innerHTML = [
    ["배정", list.length],
    ["미검토", counts.pending || 0],
    ["통과", counts.pass || 0],
    ["보류", counts.hold || 0],
    ["탈락", counts.fail || 0],
    ["PHA", companyCounts.PHA || 0],
    ["상신", companyCounts["상신브레이크"] || 0],
    ["SL", companyCounts.SL || 0],
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`).join("");
}

function Counter(values) {
  return values.reduce((acc, v) => {
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
}

function filteredCandidates() {
  const status = $("statusFilter").value;
  const q = $("searchInput").value.trim().toLowerCase();
  return batchCandidates().filter((c) => {
    const review = reviewFor(c);
    const statusOk = status === "all" || review.review_status === status;
    const text = `${c.title} ${c.part} ${c.topic} ${c.url} ${c.company}`.toLowerCase();
    return statusOk && (!q || text.includes(q));
  });
}

function renderList() {
  const current = currentCandidate();
  $("candidateList").innerHTML = filteredCandidates().map((c) => {
    const review = reviewFor(c);
    const active = current && current.candidate_id === c.candidate_id ? " active" : "";
    return `<div class="candidate-card${active}" data-id="${c.candidate_id}">
      <strong>${escapeHtml(c.source_row)}행 · ${escapeHtml(c.title)}</strong>
      <span>${escapeHtml(c.company)} · ${escapeHtml(c.part)} · ${escapeHtml(statusLabel(review.review_status))}</span>
    </div>`;
  }).join("");
  document.querySelectorAll(".candidate-card").forEach((el) => {
    el.addEventListener("click", () => setCurrent(el.dataset.id));
  });
}

function renderDocument() {
  const candidate = currentCandidate();
  if (!candidate) return;
  const review = reviewFor(candidate);

  $("candidateMeta").textContent = `${candidate.source_row}행 · ${candidate.candidate_id} · ${candidate.source_domain}`;
  $("title").textContent = candidate.title;
  $("openUrl").href = candidate.url;
  $("reason").textContent = candidate.reason || "";
  $("previewFrame").src = candidate.url;

  const meta = [
    ["부품군", candidate.company],
    ["부품", candidate.part],
    ["기술주제", candidate.topic],
    ["문서유형", candidate.source_type],
    ["발행일/연도", candidate.published_date || candidate.document_year || "미확인"],
    ["접근 힌트", candidate.access_hint],
    ["키워드", candidate.keywords],
    ["URL", candidate.url],
  ];
  $("metaGrid").innerHTML = meta.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || "")}</dd>`).join("");

  const strip = $("statusStrip");
  strip.className = `status-strip ${statusClass(review.review_status)}`;
  strip.textContent = `${statusLabel(review.review_status)}${review.reviewer ? " · " + review.reviewer : ""}${review.reviewed_at ? " · " + new Date(review.reviewed_at).toLocaleString() : ""}`;
  renderTypeGuidance(review, candidate);
  syncReviewToForm(candidate, review);

  const list = batchCandidates();
  const pos = list.findIndex((c) => c.candidate_id === candidate.candidate_id) + 1;
  $("recordPosition").textContent = `${pos || "-"} / ${list.length} · 원본 ${candidate.source_row}행`;
}

function renderTypeGuidance(review, candidate) {
  const box = $("typeGuidance");
  const type = review.source_type || candidate.source_type || "";
  const domain = candidate.source_domain || "";
  const isPatent = type.includes("특허");
  const isDataset = type.includes("데이터셋") || domain.includes("data.go.kr");

  if (!isPatent && !isDataset) {
    box.className = "type-guidance";
    box.innerHTML = "";
    return;
  }

  const blocks = [];
  if (isPatent) {
    blocks.push(`
      <h3>특허 청킹 기준</h3>
      <ul>
        <li><b>section</b> 필드에 <b>요약</b>, <b>청구항</b>, <b>발명의 상세한 설명</b>을 구분해서 기록합니다.</li>
        <li>청구항은 가능하면 <b>청구항 1</b>, <b>청구항 2</b>처럼 나눕니다.</li>
        <li>요약, 청구항, 발명의 상세한 설명을 한 청크 안에 섞지 않습니다.</li>
      </ul>
    `);
  }
  if (isDataset) {
    blocks.push(`
      <h3>공공데이터포털 청킹 기준</h3>
      <ul>
        <li>원본 CSV, XLSX, JSON 데이터 행 자체는 청킹하지 않습니다.</li>
        <li><b>데이터셋 설명</b>, <b>컬럼 정의</b>, <b>데이터 항목 설명</b>, <b>활용 가이드</b>, <b>API 명세</b>를 정리합니다.</li>
        <li>대량 반복 레코드나 단순 코드값 목록은 제외합니다.</li>
      </ul>
    `);
  }

  box.className = "type-guidance visible";
  box.innerHTML = blocks.join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function move(delta) {
  const list = batchCandidates();
  const current = currentCandidate();
  const index = list.findIndex((c) => c.candidate_id === current.candidate_id);
  const next = list[Math.max(0, Math.min(list.length - 1, index + delta))];
  if (next) setCurrent(next.candidate_id);
}

function moveToNextPending() {
  const list = batchCandidates();
  const current = currentCandidate();
  const index = list.findIndex((c) => c.candidate_id === current.candidate_id);
  const next = list.slice(index + 1).find((c) => reviewFor(c).review_status === "pending")
    || list.find((c) => reviewFor(c).review_status === "pending");
  if (next) state.currentId = next.candidate_id;
}

function saveCurrent() {
  const candidate = currentCandidate();
  const review = reviewFor(candidate);
  syncFormToReview(review);
  review.reviewer = state.reviewer || review.reviewer;
  review.reviewed_at = new Date().toISOString();
  saveState();
  render();
}

function render() {
  applyTheme();
  $("reviewerInput").value = state.reviewer || "";
  $("startRowInput").value = state.startRow || 2;
  $("batchSizeInput").value = state.batchSize || 100;
  if (!state.currentId) {
    const first = batchCandidates()[0] || CANDIDATES[0];
    state.currentId = first?.candidate_id;
  }
  renderStats();
  renderList();
  renderDocument();
}

function rowsForExport() {
  return CANDIDATES.map((c) => {
    const r = reviewFor(c);
    return {
      candidate_id: c.candidate_id,
      source_row: c.source_row,
      review_status: r.review_status,
      reviewer: r.reviewer,
      reviewed_at: r.reviewed_at,
      final_doc_id: r.final_doc_id,
      company: r.company,
      part: r.part,
      topic: r.topic,
      source_type: r.source_type,
      title: c.title,
      publisher: r.publisher,
      author: r.author,
      published_date: r.published_date,
      document_year: c.document_year,
      url: c.url,
      source_domain: c.source_domain,
      access_status: c.access_hint,
      language: c.language,
      language_verified: r.language_verified,
      access_verified: r.access_verified,
      part_relevance_verified: r.part_relevance_verified,
      topic_relevance_verified: r.topic_relevance_verified,
      source_verified: r.source_verified,
      not_duplicate_verified: r.not_duplicate_verified,
      duplicate_status: r.not_duplicate_verified ? "고유" : "미확인",
      year_exception_reason: r.year_exception_reason,
      text_extract_status: r.text_extract_status,
      chunk_count: r.chunk_count,
      hold_reason: r.hold_reason,
      fail_reason: r.fail_reason,
      notes: r.notes,
    };
  });
}

function documentsRows() {
  return CANDIDATES
    .map((c) => ({ candidate: c, review: reviewFor(c) }))
    .filter(({ review }) => review.review_status === "pass")
    .map(({ candidate: c, review: r }, index) => ({
      doc_id: r.final_doc_id || makeDocId(r.company, index + 1),
      company: r.company,
      part: r.part,
      topic: r.topic,
      source_type: r.source_type,
      title: c.title,
      publisher: r.publisher,
      author: r.author,
      published_date: r.published_date,
      url: c.url,
      original_url: c.url,
      access_status: c.access_hint,
      language: "ko",
      document_year: c.document_year,
      is_after_2016: Number(c.document_year || 0) >= 2016 ? "Y" : "N",
      year_exception_reason: r.year_exception_reason,
      duplicate_key: c.duplicate_key,
      source_domain: c.source_domain,
      file_path: "",
      text_extract_status: r.text_extract_status,
      chunk_count: r.chunk_count,
      reviewer: r.reviewer,
      reviewed_at: r.reviewed_at,
      final_status: "통과",
      remarks: r.notes,
    }));
}

function makeDocId(company, number) {
  const prefix = { PHA: "PHA", "상신브레이크": "SANGSIN", SL: "SL", 공통: "COMMON" }[company] || "DOC";
  return `${prefix}-${String(number).padStart(4, "0")}`;
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((h) => csvCell(row[h])).join(","));
  return "\ufeff" + headers.join(",") + "\n" + body.join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function bindEvents() {
  $("applyBatchBtn").addEventListener("click", () => {
    state.reviewer = $("reviewerInput").value.trim();
    state.startRow = Number($("startRowInput").value || 2);
    state.batchSize = Number($("batchSizeInput").value || 100);
    const first = batchCandidates()[0] || CANDIDATES[0];
    state.currentId = first?.candidate_id;
    saveState();
    render();
  });
  $("nextPendingBtn").addEventListener("click", () => { moveToNextPending(); saveState(); render(); });
  $("prevBtn").addEventListener("click", () => move(-1));
  $("nextBtn").addEventListener("click", () => move(1));
  $("passBtn").addEventListener("click", () => mark("pass"));
  $("holdBtn").addEventListener("click", () => mark("hold"));
  $("failBtn").addEventListener("click", () => mark("fail"));
  $("saveBtn").addEventListener("click", saveCurrent);
  $("reloadPreviewBtn").addEventListener("click", () => { $("previewFrame").src = currentCandidate().url; });
  $("statusFilter").addEventListener("change", renderList);
  $("searchInput").addEventListener("input", renderList);
  $("exportStateBtn").addEventListener("click", () => download("review_state.json", JSON.stringify(state, null, 2), "application/json"));
  $("exportCsvBtn").addEventListener("click", () => download("review_results.csv", toCsv(rowsForExport()), "text/csv;charset=utf-8"));
  $("exportDocumentsBtn").addEventListener("click", () => {
    const rows = documentsRows();
    if (!rows.length) {
      alert("통과 처리된 문서가 아직 없습니다.");
      return;
    }
    download("documents.csv", toCsv(rows), "text/csv;charset=utf-8");
  });
  $("importStateBtn").addEventListener("click", () => $("stateFileInput").click());
  $("stateFileInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const imported = JSON.parse(await file.text());
    Object.assign(state, imported);
    saveState();
    render();
  });
  $("themeSelect").addEventListener("change", () => {
    state.theme = $("themeSelect").value;
    applyTheme();
    saveState();
  });
  document.querySelector('[data-field="source_type"]').addEventListener("change", () => {
    const candidate = currentCandidate();
    const review = reviewFor(candidate);
    syncFormToReview(review);
    renderTypeGuidance(review, candidate);
    saveState();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") applyTheme();
  });
}

loadState();
applyTheme();
bindEvents();
render();
