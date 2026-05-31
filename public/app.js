import { plainTextFromMarkdown, renderMarkdown } from './lib/markdown.js';

const form = document.querySelector('#entryForm');
const appShell = document.querySelector('#appShell');
const entryId = document.querySelector('#entryId');
const occurredAt = document.querySelector('#occurredAt');
const activityType = document.querySelector('#activityType');
const title = document.querySelector('#title');
const content = document.querySelector('#content');
const markdownPreview = document.querySelector('#markdownPreview');
const images = document.querySelector('#images');
const tagsInput = document.querySelector('#tagsInput');
const problemCount = document.querySelector('#problemCount');
const workoutMinutes = document.querySelector('#workoutMinutes');
const bodyWeight = document.querySelector('#bodyWeight');
const timeline = document.querySelector('#timeline');
const template = document.querySelector('#entryTemplate');
const filterType = document.querySelector('#filterType');
const tagFilter = document.querySelector('#tagFilter');
const searchInput = document.querySelector('#searchInput');
const startDate = document.querySelector('#startDate');
const endDate = document.querySelector('#endDate');
const resetButton = document.querySelector('#resetButton');
const refreshButton = document.querySelector('#refreshButton');
const totalCount = document.querySelector('#totalCount');
const codingCount = document.querySelector('#codingCount');
const fitnessCount = document.querySelector('#fitnessCount');
const statEntries = document.querySelector('#statEntries');
const statActiveDays = document.querySelector('#statActiveDays');
const statProblems = document.querySelector('#statProblems');
const statWorkout = document.querySelector('#statWorkout');
const typeBars = document.querySelector('#typeBars');
const topTags = document.querySelector('#topTags');
const calendarTitle = document.querySelector('#calendarTitle');
const calendarGrid = document.querySelector('#calendarGrid');
const prevMonth = document.querySelector('#prevMonth');
const nextMonth = document.querySelector('#nextMonth');
const sidebarToggle = document.querySelector('#sidebarToggle');

const typeNames = {
  coding: '刷题',
  fitness: '健身',
  reading: '阅读',
  life: '生活',
  other: '其他'
};

let entries = [];
let tags = [];
let calendarMonth = new Date();

const markdownActions = {
  bold: { before: '**', after: '**', placeholder: '加粗文字' },
  italic: { before: '*', after: '*', placeholder: '斜体文字' },
  heading: { before: '## ', after: '', placeholder: '小标题', block: true },
  list: { before: '- ', after: '', placeholder: '列表项', block: true },
  quote: { before: '> ', after: '', placeholder: '引用内容', block: true },
  code: { before: '```js\n', after: '\n```', placeholder: 'console.log("hello");', block: true },
  link: { before: '[', after: '](https://example.com)', placeholder: '链接文字' }
};

function toDateTimeLocal(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function updateMarkdownPreview() {
  const rendered = renderMarkdown(content.value);
  markdownPreview.innerHTML = rendered || '开始输入后会在这里预览';
  markdownPreview.classList.toggle('empty-preview', !rendered);
}

function insertMarkdown(actionName) {
  const action = markdownActions[actionName];
  if (!action) return;

  const start = content.selectionStart;
  const end = content.selectionEnd;
  const selected = content.value.slice(start, end) || action.placeholder;
  const prefix = action.block && start > 0 && content.value[start - 1] !== '\n' ? '\n' : '';
  const nextValue = `${prefix}${action.before}${selected}${action.after}`;

  content.setRangeText(nextValue, start, end, 'select');
  const selectStart = start + prefix.length + action.before.length;
  content.selectionStart = selectStart;
  content.selectionEnd = selectStart + selected.length;
  content.focus();
  updateMarkdownPreview();
}

function readMetrics() {
  const metrics = {};
  if (problemCount.value) metrics.problemCount = Number(problemCount.value);
  if (workoutMinutes.value) metrics.workoutMinutes = Number(workoutMinutes.value);
  if (bodyWeight.value) metrics.bodyWeight = Number(bodyWeight.value);
  return metrics;
}

function setMetrics(metrics = {}) {
  problemCount.value = metrics.problemCount ?? '';
  workoutMinutes.value = metrics.workoutMinutes ?? '';
  bodyWeight.value = metrics.bodyWeight ?? '';
}

function parseTagInput(value) {
  const seen = new Set();
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function resetForm() {
  entryId.value = '';
  form.reset();
  occurredAt.value = toDateTimeLocal();
  setMetrics();
  tagsInput.value = '';
  form.querySelector('.primary-button').textContent = '保存记录';
  updateMarkdownPreview();
}

function metricText(metrics = {}) {
  const result = [];
  if (metrics.problemCount) result.push(`题目 ${metrics.problemCount}`);
  if (metrics.workoutMinutes) result.push(`训练 ${metrics.workoutMinutes} 分钟`);
  if (metrics.bodyWeight) result.push(`体重 ${metrics.bodyWeight} kg`);
  return result;
}

function plainSummary(markdown, length = 130) {
  const text = plainTextFromMarkdown(markdown);
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function renderImageGrid(container, entry) {
  for (const image of entry.images || []) {
    const img = document.createElement('img');
    img.src = image.url;
    img.alt = image.originalName || entry.title;
    container.append(img);
  }
}

function render(entriesToRender) {
  timeline.replaceChildren();
  totalCount.textContent = String(entriesToRender.length);
  codingCount.textContent = String(entriesToRender.filter((entry) => entry.activityType === 'coding').length);
  fitnessCount.textContent = String(entriesToRender.filter((entry) => entry.activityType === 'fitness').length);

  if (!entriesToRender.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '还没有匹配的记录';
    timeline.append(empty);
    return;
  }

  for (const entry of entriesToRender) {
    const node = template.content.cloneNode(true);
    const article = node.querySelector('.entry-card');
    const pill = node.querySelector('.type-pill');
    const metricRow = node.querySelector('.metric-row');
    const tagRow = node.querySelector('.tag-row');
    const imageGrid = node.querySelector('.image-grid');

    article.dataset.id = entry.id;
    node.querySelector('time').textContent = formatDateTime(entry.occurredAt);
    node.querySelector('h2').textContent = entry.title;
    node.querySelector('.entry-content').textContent = plainSummary(entry.content) || '无正文';
    pill.textContent = typeNames[entry.activityType] || entry.activityType;
    pill.classList.add(entry.activityType);

    for (const item of metricText(entry.metrics)) {
      const badge = document.createElement('span');
      badge.textContent = item;
      metricRow.append(badge);
    }

    if (!metricRow.children.length) metricRow.remove();

    for (const tag of entry.tags || []) {
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.textContent = `#${tag.name}`;
      badge.dataset.tag = tag.name;
      tagRow.append(badge);
    }

    if (!tagRow.children.length) tagRow.remove();

    renderImageGrid(imageGrid, entry);

    if (!imageGrid.children.length) imageGrid.remove();
    timeline.append(node);
  }
}

function renderTagFilter() {
  const current = tagFilter.value;
  tagFilter.replaceChildren(new Option('全部标签', 'all'));
  for (const tag of tags) {
    tagFilter.append(new Option(`${tag.name} (${tag.count})`, tag.name));
  }
  tagFilter.value = [...tagFilter.options].some((option) => option.value === current) ? current : 'all';
}

async function loadEntries() {
  const params = new URLSearchParams();
  if (filterType.value !== 'all') params.set('activityType', filterType.value);
  if (tagFilter.value !== 'all') params.set('tag', tagFilter.value);
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
  if (startDate.value) params.set('start', `${startDate.value}T00:00:00`);
  if (endDate.value) params.set('end', `${endDate.value}T23:59:59`);

  const response = await fetch(`/api/entries?${params.toString()}`);
  if (!response.ok) throw new Error('记录加载失败');
  const data = await response.json();
  entries = data.entries;
  render(entries);
}

async function loadTags() {
  const response = await fetch('/api/tags');
  if (!response.ok) throw new Error('标签加载失败');
  const data = await response.json();
  tags = data.tags;
  renderTagFilter();
}

function renderStats(data) {
  const overview = data.overview || {};
  statEntries.textContent = overview.total_entries ?? 0;
  statActiveDays.textContent = overview.active_days ?? 0;
  statProblems.textContent = overview.total_problems ?? 0;
  statWorkout.textContent = overview.total_workout_minutes ?? 0;

  typeBars.replaceChildren();
  const maxCount = Math.max(...(data.byType || []).map((item) => item.count), 1);
  for (const item of data.byType || []) {
    const row = document.createElement('div');
    row.className = 'type-bar';
    row.innerHTML = `
      <span>${typeNames[item.activity_type] || item.activity_type}</span>
      <div><i style="width: ${(item.count / maxCount) * 100}%"></i></div>
      <b>${item.count}</b>
    `;
    typeBars.append(row);
  }

  topTags.replaceChildren();
  for (const tag of data.topTags || []) {
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.textContent = `#${tag.name} ${tag.count}`;
    badge.dataset.tag = tag.name;
    topTags.append(badge);
  }
}

async function loadStats() {
  const response = await fetch('/api/stats');
  if (!response.ok) throw new Error('统计加载失败');
  renderStats(await response.json());
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderCalendar(month, days) {
  const dayMap = new Map(days.map((day) => [day.day.slice(0, 10), day]));
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const leading = (firstDay.getDay() + 6) % 7;

  calendarTitle.textContent = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long'
  }).format(month);
  calendarGrid.replaceChildren();

  for (let i = 0; i < leading; i += 1) {
    const empty = document.createElement('span');
    empty.className = 'calendar-day empty';
    calendarGrid.append(empty);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthIndex, day);
    const key = localDateKey(date);
    const data = dayMap.get(key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day';
    button.dataset.date = key;
    if (data) button.classList.add('has-entry');
    button.innerHTML = `
      <span>${day}</span>
      <small>${data ? data.entry_count : ''}</small>
    `;
    calendarGrid.append(button);
  }
}

async function loadCalendar() {
  const response = await fetch(`/api/calendar?month=${monthKey(calendarMonth)}`);
  if (!response.ok) throw new Error('日历加载失败');
  const data = await response.json();
  renderCalendar(calendarMonth, data.days);
}

async function refreshDashboard() {
  await Promise.all([loadTags(), loadStats(), loadCalendar()]);
}

async function errorMessage(response, fallback) {
  try {
    const data = await response.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

async function saveEntry(event) {
  event.preventDefault();

  if (entryId.value) {
    const response = await fetch(`/api/entries/${entryId.value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occurredAt: new Date(occurredAt.value).toISOString(),
        activityType: activityType.value,
        title: title.value.trim(),
        content: content.value.trim(),
        metrics: readMetrics(),
        tags: parseTagInput(tagsInput.value)
      })
    });
    if (!response.ok) throw new Error(await errorMessage(response, '更新失败'));
  } else {
    const data = new FormData();
    data.set('occurredAt', new Date(occurredAt.value).toISOString());
    data.set('activityType', activityType.value);
    data.set('title', title.value.trim());
    data.set('content', content.value.trim());
    data.set('metrics', JSON.stringify(readMetrics()));
    data.set('tags', JSON.stringify(parseTagInput(tagsInput.value)));
    for (const file of images.files) data.append('images', file);

    const response = await fetch('/api/entries', {
      method: 'POST',
      body: data
    });
    if (!response.ok) throw new Error(await errorMessage(response, '保存失败'));
  }

  resetForm();
  await Promise.all([loadEntries(), refreshDashboard()]);
}

function editEntry(id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;
  entryId.value = entry.id;
  occurredAt.value = toDateTimeLocal(new Date(entry.occurredAt));
  activityType.value = entry.activityType;
  title.value = entry.title;
  content.value = entry.content;
  setMetrics(entry.metrics);
  tagsInput.value = (entry.tags || []).map((tag) => tag.name).join(', ');
  images.value = '';
  form.querySelector('.primary-button').textContent = '更新记录';
  updateMarkdownPreview();
  document.querySelector('.editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteEntry(id) {
  const confirmed = window.confirm('确定删除这条记录吗？');
  if (!confirmed) return;
  const response = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('删除失败');
  await Promise.all([loadEntries(), refreshDashboard()]);
}

function debounce(callback, delay = 250) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

form.addEventListener('submit', (event) => {
  saveEntry(event).catch((error) => {
    window.alert(error.message);
  });
});

timeline.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  const article = event.target.closest('.entry-card');
  if (!button || !article) return;
  if (button.dataset.action === 'view') window.location.href = `/record.html?id=${encodeURIComponent(article.dataset.id)}`;
  if (button.dataset.action === 'edit') editEntry(article.dataset.id);
  if (button.dataset.action === 'delete') {
    deleteEntry(article.dataset.id).catch((error) => window.alert(error.message));
  }
  if (button.dataset.tag) {
    tagFilter.value = button.dataset.tag;
    loadEntries().catch((error) => window.alert(error.message));
  }
});

const debouncedLoad = debounce(() => loadEntries().catch((error) => window.alert(error.message)));
for (const control of [filterType, tagFilter, startDate, endDate]) {
  control.addEventListener('change', debouncedLoad);
}
searchInput.addEventListener('input', debouncedLoad);
resetButton.addEventListener('click', resetForm);
refreshButton.addEventListener('click', () => Promise.all([loadEntries(), refreshDashboard()]).catch((error) => window.alert(error.message)));
content.addEventListener('input', updateMarkdownPreview);
document.querySelector('.editor-toolbar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-md]');
  if (!button) return;
  insertMarkdown(button.dataset.md);
});
sidebarToggle.addEventListener('click', () => {
  const collapsed = appShell.classList.toggle('sidebar-collapsed');
  sidebarToggle.textContent = collapsed ? '›' : '‹';
  sidebarToggle.title = collapsed ? '展开记录栏' : '折叠记录栏';
});
prevMonth.addEventListener('click', () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  loadCalendar().catch((error) => window.alert(error.message));
});
nextMonth.addEventListener('click', () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  loadCalendar().catch((error) => window.alert(error.message));
});
calendarGrid.addEventListener('click', (event) => {
  const button = event.target.closest('.calendar-day');
  if (!button?.dataset.date) return;
  startDate.value = button.dataset.date;
  endDate.value = button.dataset.date;
  loadEntries().catch((error) => window.alert(error.message));
});
topTags.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button?.dataset.tag) return;
  tagFilter.value = button.dataset.tag;
  loadEntries().catch((error) => window.alert(error.message));
});

resetForm();
updateMarkdownPreview();
Promise.all([loadEntries(), refreshDashboard()]).catch((error) => {
  timeline.textContent = error.message;
});
