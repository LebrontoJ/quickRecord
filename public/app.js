const form = document.querySelector('#entryForm');
const entryId = document.querySelector('#entryId');
const occurredAt = document.querySelector('#occurredAt');
const activityType = document.querySelector('#activityType');
const title = document.querySelector('#title');
const content = document.querySelector('#content');
const images = document.querySelector('#images');
const problemCount = document.querySelector('#problemCount');
const workoutMinutes = document.querySelector('#workoutMinutes');
const bodyWeight = document.querySelector('#bodyWeight');
const timeline = document.querySelector('#timeline');
const template = document.querySelector('#entryTemplate');
const filterType = document.querySelector('#filterType');
const searchInput = document.querySelector('#searchInput');
const startDate = document.querySelector('#startDate');
const endDate = document.querySelector('#endDate');
const resetButton = document.querySelector('#resetButton');
const refreshButton = document.querySelector('#refreshButton');
const totalCount = document.querySelector('#totalCount');
const codingCount = document.querySelector('#codingCount');
const fitnessCount = document.querySelector('#fitnessCount');

const typeNames = {
  coding: '刷题',
  fitness: '健身',
  reading: '阅读',
  life: '生活',
  other: '其他'
};

let entries = [];

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

function resetForm() {
  entryId.value = '';
  form.reset();
  occurredAt.value = toDateTimeLocal();
  setMetrics();
  form.querySelector('.primary-button').textContent = '保存记录';
}

function metricText(metrics = {}) {
  const result = [];
  if (metrics.problemCount) result.push(`题目 ${metrics.problemCount}`);
  if (metrics.workoutMinutes) result.push(`训练 ${metrics.workoutMinutes} 分钟`);
  if (metrics.bodyWeight) result.push(`体重 ${metrics.bodyWeight} kg`);
  return result;
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
    const imageGrid = node.querySelector('.image-grid');

    article.dataset.id = entry.id;
    node.querySelector('time').textContent = formatDateTime(entry.occurredAt);
    node.querySelector('h2').textContent = entry.title;
    node.querySelector('.entry-content').textContent = entry.content || '无正文';
    pill.textContent = typeNames[entry.activityType] || entry.activityType;
    pill.classList.add(entry.activityType);

    for (const item of metricText(entry.metrics)) {
      const badge = document.createElement('span');
      badge.textContent = item;
      metricRow.append(badge);
    }

    if (!metricRow.children.length) metricRow.remove();

    for (const image of entry.images || []) {
      const img = document.createElement('img');
      img.src = image.url;
      img.alt = image.originalName || entry.title;
      imageGrid.append(img);
    }

    if (!imageGrid.children.length) imageGrid.remove();
    timeline.append(node);
  }
}

async function loadEntries() {
  const params = new URLSearchParams();
  if (filterType.value !== 'all') params.set('activityType', filterType.value);
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
  if (startDate.value) params.set('start', `${startDate.value}T00:00:00`);
  if (endDate.value) params.set('end', `${endDate.value}T23:59:59`);

  const response = await fetch(`/api/entries?${params.toString()}`);
  if (!response.ok) throw new Error('记录加载失败');
  const data = await response.json();
  entries = data.entries;
  render(entries);
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
        metrics: readMetrics()
      })
    });
    if (!response.ok) throw new Error('更新失败');
  } else {
    const data = new FormData();
    data.set('occurredAt', new Date(occurredAt.value).toISOString());
    data.set('activityType', activityType.value);
    data.set('title', title.value.trim());
    data.set('content', content.value.trim());
    data.set('metrics', JSON.stringify(readMetrics()));
    for (const file of images.files) data.append('images', file);

    const response = await fetch('/api/entries', {
      method: 'POST',
      body: data
    });
    if (!response.ok) throw new Error('保存失败');
  }

  resetForm();
  await loadEntries();
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
  images.value = '';
  form.querySelector('.primary-button').textContent = '更新记录';
  document.querySelector('.editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteEntry(id) {
  const confirmed = window.confirm('确定删除这条记录吗？');
  if (!confirmed) return;
  const response = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('删除失败');
  await loadEntries();
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
  if (button.dataset.action === 'edit') editEntry(article.dataset.id);
  if (button.dataset.action === 'delete') {
    deleteEntry(article.dataset.id).catch((error) => window.alert(error.message));
  }
});

const debouncedLoad = debounce(() => loadEntries().catch((error) => window.alert(error.message)));
for (const control of [filterType, startDate, endDate]) {
  control.addEventListener('change', debouncedLoad);
}
searchInput.addEventListener('input', debouncedLoad);
resetButton.addEventListener('click', resetForm);
refreshButton.addEventListener('click', () => loadEntries().catch((error) => window.alert(error.message)));

resetForm();
loadEntries().catch((error) => {
  timeline.textContent = error.message;
});
