const jobs = (Array.isArray(window.JOBS) ? [...window.JOBS] : []).sort((a, b) => {
  const published = String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
  if (published) return published;
  return String(b.verifiedAt || "").localeCompare(String(a.verifiedAt || ""));
});
const meta = window.SITE_META || {};
const pageSize = 20;
let currentPage = 1;

const els = {
  keyword: document.querySelector("#keyword"),
  province: document.querySelector("#province"),
  level: document.querySelector("#level"),
  discipline: document.querySelector("#discipline"),
  status: document.querySelector("#status"),
  resetFilters: document.querySelector("#resetFilters"),
  jobRows: document.querySelector("#jobRows"),
  emptyJobs: document.querySelector("#emptyJobs"),
  shownCount: document.querySelector("#shownCount"),
  activeCount: document.querySelector("#activeCount"),
  urgentCount: document.querySelector("#urgentCount"),
  schoolCount: document.querySelector("#schoolCount"),
  pagination: document.querySelector("#pagination"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  pageInfo: document.querySelector("#pageInfo"),
  pageRange: document.querySelector("#pageRange"),
};

const statusLabels = {
  active: "报名中",
  urgent: "即将截止",
  expired: "已截止",
  unknown: "看公告",
};

const statusOptions = [
  ["", "全部状态"],
  ["active", "报名中"],
  ["urgent", "7 天内截止"],
  ["expired", "已截止"],
  ["unknown", "看公告"],
];

const disciplineOptions = [
  ["", "全部方向"],
  ["美术", "美术"],
  ["设计", "设计"],
  ["音乐", "音乐"],
  ["舞蹈", "舞蹈"],
  ["戏剧影视", "戏剧影视"],
  ["动画", "动画"],
  ["数字媒体", "数字媒体"],
  ["服装", "服装"],
  ["工艺美术", "工艺美术"],
  ["书法", "书法"],
  ["艺术理论", "艺术理论"],
  ["艺术教育", "艺术教育"],
  ["艺术管理", "艺术管理"],
];

const disciplineAliases = {
  美术: ["美术", "绘画", "雕塑", "造型", "美术与书法"],
  设计: ["设计", "视觉传达", "环境艺术", "环境设计", "产品设计", "艺术设计", "设计学"],
  音乐: ["音乐", "声乐", "器乐", "作曲", "钢琴"],
  舞蹈: ["舞蹈", "国际标准舞"],
  戏剧影视: ["戏剧影视", "戏曲", "影视", "电影", "表演", "导演", "播音", "摄影"],
  动画: ["动画"],
  数字媒体: ["数字媒体", "数字创意", "新媒体", "艺术科技", "艺术与科技", "科技艺术"],
  服装: ["服装", "时尚"],
  工艺美术: ["工艺美术"],
  书法: ["书法"],
  艺术理论: ["艺术理论", "艺术学理论", "艺术学", "美学", "艺术史", "艺术批评"],
  艺术教育: ["艺术教育", "美育"],
  艺术管理: ["艺术管理"],
};

const today = parseDate(meta.today) || new Date();

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from, to) {
  const ms = parseDate(to)?.getTime() - from.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86400000);
}

function getStatus(job) {
  if (job.statusOverride) return job.statusOverride;
  const distance = daysBetween(today, job.deadline);
  if (distance === null) return "unknown";
  if (distance < 0) return "expired";
  if (distance <= 7) return "urgent";
  return "active";
}

function uniqueValues(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN")
  );
}

function fillSelect(select, options) {
  select.innerHTML = "";
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
}

function setupFilters() {
  fillSelect(els.province, [["", "全部省份"], ...uniqueValues(jobs, "province").map((value) => [value, value])]);
  fillSelect(els.level, [["", "全部层次"], ...uniqueValues(jobs, "level").map((value) => [value, value])]);
  fillSelect(els.discipline, disciplineOptions);
  fillSelect(els.status, statusOptions);
}

function getSearchText(job) {
  const levelAlias = job.level === "高职专科" ? "大专 专科 高职 高职专科" : "";
  return [
    job.school,
    job.province,
    job.city,
    job.level,
    levelAlias,
    job.schoolType,
    job.title,
    job.discipline,
    job.jobType,
    job.note,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesFilters(job) {
  const keyword = els.keyword.value.trim().toLowerCase();
  const status = getStatus(job);
  const selectedStatus = els.status.value;
  const selectedDiscipline = els.discipline.value;

  if (keyword && !getSearchText(job).includes(keyword)) return false;
  if (els.province.value && job.province !== els.province.value) return false;
  if (els.level.value && job.level !== els.level.value) return false;
  if (selectedDiscipline && !matchesDiscipline(job, selectedDiscipline)) return false;
  if (selectedStatus === "active" && !["active", "urgent"].includes(status)) return false;
  if (selectedStatus && selectedStatus !== "active" && status !== selectedStatus) return false;
  return true;
}

function matchesDiscipline(job, category) {
  const haystack = [job.discipline, job.title, job.note].filter(Boolean).join(" ");
  const aliases = disciplineAliases[category] || [category];
  return aliases.some((alias) => haystack.includes(alias));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderJobs() {
  const filtered = jobs.filter(matchesFilters);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const start = (currentPage - 1) * pageSize;
  const pagedJobs = filtered.slice(start, start + pageSize);
  const rows = pagedJobs.map((job) => {
    const status = getStatus(job);
    const region = job.city && job.city !== job.province ? `${job.province} / ${job.city}` : job.province;
    const source = job.sourceUrl
      ? `<a href="${escapeHtml(job.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.sourceName || "查看原文")}</a>`
      : escapeHtml(job.sourceName || "待补充");

    return `
      <tr>
        <td data-label="学校">
          <div class="school">
            <strong>${escapeHtml(job.school)}</strong>
            <span>${escapeHtml(job.schoolType || "")}</span>
          </div>
        </td>
        <td data-label="地区"><span class="region">${escapeHtml(region)}</span></td>
        <td data-label="层次"><span class="tag">${escapeHtml(job.level)}</span></td>
        <td data-label="岗位">
          <div class="job-title">${escapeHtml(job.title)}</div>
          ${job.note ? `<div class="note">${escapeHtml(job.note)}</div>` : ""}
        </td>
        <td data-label="方向">${escapeHtml(job.discipline)}</td>
        <td data-label="类型">${escapeHtml(job.jobType)}</td>
        <td data-label="发布日期">${escapeHtml(job.publishedAt || "-")}</td>
        <td data-label="截止">${escapeHtml(job.deadlineText || job.deadline || "以公告为准")}</td>
        <td data-label="状态"><span class="status ${status}">${statusLabels[status]}</span></td>
        <td data-label="来源">${source}<br /><span class="note">核验：${escapeHtml(job.verifiedAt || "-")}</span></td>
      </tr>
    `;
  });

  els.jobRows.innerHTML = rows.join("");
  els.emptyJobs.hidden = filtered.length > 0;
  els.shownCount.textContent = filtered.length;
  els.activeCount.textContent = jobs.filter((job) => ["active", "urgent"].includes(getStatus(job))).length;
  els.urgentCount.textContent = jobs.filter((job) => getStatus(job) === "urgent").length;
  els.schoolCount.textContent = new Set(jobs.map((job) => job.school)).size;
  updatePagination(filtered.length, totalPages, start, pagedJobs.length);

  return filtered;
}

function updatePagination(total, totalPages, start, pageCount) {
  if (!els.pagination) return;
  els.pagination.hidden = total === 0;
  els.prevPage.disabled = currentPage <= 1;
  els.nextPage.disabled = currentPage >= totalPages;
  els.pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;

  const from = total === 0 ? 0 : start + 1;
  const to = start + pageCount;
  els.pageRange.textContent = `本页 ${from}-${to} 条，共 ${total} 条`;
}

function resetFilters() {
  els.keyword.value = "";
  els.province.value = "";
  els.level.value = "";
  els.discipline.value = "";
  els.status.value = "";
  currentPage = 1;
  renderJobs();
}

function bindEvents() {
  const renderFirstPage = () => {
    currentPage = 1;
    renderJobs();
  };

  [els.keyword, els.province, els.level, els.discipline, els.status].forEach((el) => {
    el.addEventListener("input", renderFirstPage);
    el.addEventListener("change", renderFirstPage);
  });
  els.resetFilters.addEventListener("click", resetFilters);
  els.prevPage.addEventListener("click", () => {
    currentPage -= 1;
    renderJobs();
  });
  els.nextPage.addEventListener("click", () => {
    currentPage += 1;
    renderJobs();
  });
}

setupFilters();
renderJobs();
bindEvents();
