import { escapeHtml, plainTextFromMarkdown, renderMarkdown } from './lib/markdown.js';

const recordContent = document.querySelector('#recordContent');
const backToMain = document.querySelector('#backToMain');
const copyButton = document.querySelector('#copyButton');
const editButton = document.querySelector('#editRecordButton');

const typeNames = {
  coding: '刷题',
  fitness: '健身',
  reading: '阅读',
  life: '生活',
  other: '其他'
};

const markdownActions = {
  bold: { before: '**', after: '**', placeholder: '加粗文字' },
  italic: { before: '*', after: '*', placeholder: '斜体文字' },
  heading: { before: '## ', after: '', placeholder: '小标题', block: true },
  list: { before: '- ', after: '', placeholder: '列表项', block: true },
  quote: { before: '> ', after: '', placeholder: '引用内容', block: true },
  code: { before: '```js\n', after: '\n```', placeholder: 'console.log("hello");', block: true },
  link: { before: '[', after: '](https://example.com)', placeholder: '链接文字' }
};

let currentEntry = null;
let mode = 'view';

function formatDateTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function toDateTimeLocal(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function metricText(metrics = {}) {
  const result = [];
  if (metrics.problemCount) result.push(`题目 ${metrics.problemCount}`);
  if (metrics.workoutMinutes) result.push(`训练 ${metrics.workoutMinutes} 分钟`);
  if (metrics.bodyWeight) result.push(`体重 ${metrics.bodyWeight} kg`);
  return result;
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

function readMetrics(form) {
  const metrics = {};
  const problemCount = form.querySelector('#recordProblemCount').value;
  const workoutMinutes = form.querySelector('#recordWorkoutMinutes').value;
  const bodyWeight = form.querySelector('#recordBodyWeight').value;
  if (problemCount) metrics.problemCount = Number(problemCount);
  if (workoutMinutes) metrics.workoutMinutes = Number(workoutMinutes);
  if (bodyWeight) metrics.bodyWeight = Number(bodyWeight);
  return metrics;
}

async function errorMessage(response, fallback) {
  try {
    const data = await response.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function copyTextForEntry(entry) {
  return plainTextFromMarkdown(entry.content);
}

function firework(x, y) {
  const colors = ['#2f6f68', '#b75d69', '#aa7c2c', '#f3d27a', '#7da6a1'];
  for (let i = 0; i < 24; i += 1) {
    const particle = document.createElement('span');
    const angle = (Math.PI * 2 * i) / 24;
    const distance = 46 + Math.random() * 58;
    particle.className = 'spark';
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.background = colors[i % colors.length];
    particle.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
    particle.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
    document.body.append(particle);
    particle.addEventListener('animationend', () => particle.remove());
  }
}

function renderImageGrid(entry) {
  return (entry.images || [])
    .map((image) => `<img src="${image.url}" alt="${escapeHtml(image.originalName || entry.title)}" loading="lazy" />`)
    .join('');
}

function renderView(entry) {
  mode = 'view';
  editButton.textContent = '编辑记录';
  copyButton.disabled = false;

  const metrics = metricText(entry.metrics)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join('');
  const tags = (entry.tags || [])
    .map((tag) => `<span class="tag-chip">#${escapeHtml(tag.name)}</span>`)
    .join('');
  const images = renderImageGrid(entry);

  document.title = `${entry.title} - Quick Record`;
  recordContent.innerHTML = `
    <header class="detail-header">
      <time>${formatDateTime(entry.occurredAt)}</time>
      <h1>${escapeHtml(entry.title)}</h1>
      <span class="type-pill ${entry.activityType}">${typeNames[entry.activityType] || entry.activityType}</span>
    </header>
    ${metrics ? `<div class="metric-row">${metrics}</div>` : ''}
    ${tags ? `<div class="tag-row">${tags}</div>` : ''}
    <div class="detail-body markdown-body">${renderMarkdown(entry.content) || '<p>无正文</p>'}</div>
    ${images ? `<div class="image-grid detail-images">${images}</div>` : ''}
  `;
}

function updateEditPreview(form) {
  const content = form.querySelector('#recordContentInput').value;
  const preview = form.querySelector('#recordMarkdownPreview');
  const rendered = renderMarkdown(content);
  preview.innerHTML = rendered || '开始输入后会在这里预览';
  preview.classList.toggle('empty-preview', !rendered);
}

function insertMarkdown(form, actionName) {
  const textarea = form.querySelector('#recordContentInput');
  const action = markdownActions[actionName];
  if (!action) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end) || action.placeholder;
  const prefix = action.block && start > 0 && textarea.value[start - 1] !== '\n' ? '\n' : '';
  const nextValue = `${prefix}${action.before}${selected}${action.after}`;

  textarea.setRangeText(nextValue, start, end, 'select');
  const selectStart = start + prefix.length + action.before.length;
  textarea.selectionStart = selectStart;
  textarea.selectionEnd = selectStart + selected.length;
  textarea.focus();
  updateEditPreview(form);
}

function renderEdit(entry) {
  mode = 'edit';
  editButton.textContent = '取消编辑';
  copyButton.disabled = true;

  recordContent.innerHTML = `
    <form id="recordEditForm" class="record-edit-form">
      <div class="title-grid">
        <label>
          <span>标题</span>
          <input id="recordTitle" type="text" value="${escapeHtml(entry.title)}" required />
        </label>
      </div>
      <div class="form-grid meta-grid">
        <label>
          <span>时间</span>
          <input id="recordOccurredAt" type="datetime-local" value="${toDateTimeLocal(new Date(entry.occurredAt))}" required />
        </label>
        <label>
          <span>类型</span>
          <select id="recordActivityType" required>
            ${Object.entries(typeNames)
              .map(([value, label]) => `<option value="${value}" ${entry.activityType === value ? 'selected' : ''}>${label}</option>`)
              .join('')}
          </select>
        </label>
        <label>
          <span>标签</span>
          <input id="recordTagsInput" type="text" value="${escapeHtml((entry.tags || []).map((tag) => tag.name).join(', '))}" />
        </label>
      </div>
      <section class="markdown-editor record-markdown-editor">
        <div class="editor-toolbar">
          <span>Markdown</span>
          <div class="toolbar-actions">
            <button type="button" data-md="bold" title="加粗">B</button>
            <button type="button" data-md="italic" title="斜体">I</button>
            <button type="button" data-md="heading" title="二级标题">H2</button>
            <button type="button" data-md="list" title="列表">•</button>
            <button type="button" data-md="quote" title="引用">”</button>
            <button type="button" data-md="code" title="代码块">&lt;/&gt;</button>
            <button type="button" data-md="link" title="链接">Link</button>
          </div>
        </div>
        <div class="markdown-workspace record-markdown-workspace">
          <label class="editor-field">
            <span>正文</span>
            <textarea id="recordContentInput">${escapeHtml(entry.content || '')}</textarea>
          </label>
          <section class="preview-panel">
            <div class="preview-title">预览</div>
            <div id="recordMarkdownPreview" class="markdown-body"></div>
          </section>
        </div>
      </section>
      <div class="metrics-grid">
        <label>
          <span>题目数</span>
          <input id="recordProblemCount" type="number" min="0" value="${entry.metrics?.problemCount ?? ''}" />
        </label>
        <label>
          <span>训练分钟</span>
          <input id="recordWorkoutMinutes" type="number" min="0" value="${entry.metrics?.workoutMinutes ?? ''}" />
        </label>
        <label>
          <span>体重 kg</span>
          <input id="recordBodyWeight" type="number" min="0" step="0.1" value="${entry.metrics?.bodyWeight ?? ''}" />
        </label>
      </div>
      <div class="form-actions record-form-actions">
        <button class="secondary-button" id="cancelRecordEdit" type="button">取消</button>
        <button class="primary-button" type="submit">保存修改</button>
      </div>
    </form>
  `;

  const form = recordContent.querySelector('#recordEditForm');
  updateEditPreview(form);
  form.querySelector('#recordContentInput').addEventListener('input', () => updateEditPreview(form));
  form.querySelector('.editor-toolbar').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-md]');
    if (!button) return;
    insertMarkdown(form, button.dataset.md);
  });
  form.querySelector('#cancelRecordEdit').addEventListener('click', () => renderView(currentEntry));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`/api/entries/${currentEntry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occurredAt: new Date(form.querySelector('#recordOccurredAt').value).toISOString(),
          activityType: form.querySelector('#recordActivityType').value,
          title: form.querySelector('#recordTitle').value.trim(),
          content: form.querySelector('#recordContentInput').value.trim(),
          metrics: readMetrics(form),
          tags: parseTagInput(form.querySelector('#recordTagsInput').value)
        })
      });

      if (!response.ok) throw new Error(await errorMessage(response, '更新失败'));
      const data = await response.json();
      currentEntry = data.entry;
      renderView(currentEntry);
    } catch (error) {
      window.alert(error.message);
    }
  });
}

async function loadRecord() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) {
    recordContent.innerHTML = '<div class="empty-state">缺少记录 ID</div>';
    return;
  }

  const response = await fetch(`/api/entries/${encodeURIComponent(id)}`);
  if (!response.ok) {
    recordContent.innerHTML = '<div class="empty-state">记录加载失败</div>';
    return;
  }

  const data = await response.json();
  currentEntry = data.entry;
  renderView(currentEntry);
  window.setTimeout(() => firework(window.innerWidth / 2, 120), 220);
}

backToMain.addEventListener('click', () => {
  window.location.href = '/';
});

copyButton.addEventListener('click', async () => {
  if (!currentEntry) return;
  await navigator.clipboard.writeText(copyTextForEntry(currentEntry));
  const original = copyButton.textContent;
  copyButton.textContent = '已复制';
  window.setTimeout(() => {
    copyButton.textContent = original;
  }, 1300);
});

editButton.addEventListener('click', () => {
  if (!currentEntry) return;
  if (mode === 'edit') {
    renderView(currentEntry);
    return;
  }
  renderEdit(currentEntry);
});

document.addEventListener('click', (event) => {
  if (event.target.closest('button, a, input, textarea, select')) return;
  firework(event.clientX, event.clientY);
});

loadRecord().catch((error) => {
  recordContent.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
