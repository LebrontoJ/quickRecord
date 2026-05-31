const recordContent = document.querySelector('#recordContent');
const backToMain = document.querySelector('#backToMain');
const celebrateButton = document.querySelector('#celebrateButton');

const typeNames = {
  coding: '刷题',
  fitness: '健身',
  reading: '阅读',
  life: '生活',
  other: '其他'
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderInlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return html;
}

function renderMarkdown(markdown) {
  const source = String(markdown || '').replace(/\r\n/g, '\n').trim();
  if (!source) return '';

  const lines = source.split('\n');
  const html = [];
  let inCode = false;
  let codeLines = [];
  let paragraph = [];
  let list = [];
  let quote = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    html.push(`<ul>${list.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
    list = [];
  }

  function flushQuote() {
    if (!quote.length) return;
    html.push(`<blockquote>${quote.map((item) => `<p>${renderInlineMarkdown(item)}</p>`).join('')}</blockquote>`);
    quote = [];
  }

  function flushBlocks() {
    flushParagraph();
    flushList();
    flushQuote();
  }

  function isTableSeparator(line) {
    return /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
  }

  function parseTableRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line.startsWith('```')) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        flushBlocks();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushBlocks();
      continue;
    }

    if (line.includes('|') && lines[lineIndex + 1] && isTableSeparator(lines[lineIndex + 1])) {
      flushBlocks();
      const headers = parseTableRow(line);
      const rows = [];
      lineIndex += 2;
      while (lineIndex < lines.length && lines[lineIndex].includes('|') && lines[lineIndex].trim()) {
        rows.push(parseTableRow(lines[lineIndex]));
        lineIndex += 1;
      }
      lineIndex -= 1;
      html.push(`
        <table>
          <thead><tr>${headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      `);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      html.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      flushQuote();
      list.push(listItem[1]);
      continue;
    }

    const quoteItem = line.match(/^>\s?(.+)$/);
    if (quoteItem) {
      flushParagraph();
      flushList();
      quote.push(quoteItem[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(line.trim());
  }

  if (inCode) html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  flushBlocks();
  return html.join('');
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function metricText(metrics = {}) {
  const result = [];
  if (metrics.problemCount) result.push(`题目 ${metrics.problemCount}`);
  if (metrics.workoutMinutes) result.push(`训练 ${metrics.workoutMinutes} 分钟`);
  if (metrics.bodyWeight) result.push(`体重 ${metrics.bodyWeight} kg`);
  return result;
}

function firework(x, y) {
  const colors = ['#2f6f68', '#b75d69', '#aa7c2c', '#f3d27a', '#7da6a1'];
  for (let i = 0; i < 24; i += 1) {
    const particle = document.createElement('span');
    const angle = (Math.PI * 2 * i) / 24;
    const distance = 48 + Math.random() * 54;
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

function renderRecord(entry) {
  const metrics = metricText(entry.metrics)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join('');
  const tags = (entry.tags || [])
    .map((tag) => `<span class="tag-chip">#${escapeHtml(tag.name)}</span>`)
    .join('');
  const images = (entry.images || [])
    .map((image) => `<img src="${image.url}" alt="${escapeHtml(image.originalName || entry.title)}" loading="lazy" />`)
    .join('');

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
  renderRecord(data.entry);
  window.setTimeout(() => firework(window.innerWidth / 2, 120), 240);
}

backToMain.addEventListener('click', () => {
  window.location.href = '/';
});

celebrateButton.addEventListener('click', (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  firework(rect.left + rect.width / 2, rect.top + rect.height / 2);
});

document.addEventListener('click', (event) => {
  if (event.target.closest('button, a')) return;
  firework(event.clientX, event.clientY);
});

loadRecord();
