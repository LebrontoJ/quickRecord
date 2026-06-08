import { diffLines, diffSummary } from './lib/diff.js';

const leftText = document.querySelector('#leftText');
const rightText = document.querySelector('#rightText');
const leftFile = document.querySelector('#leftFile');
const rightFile = document.querySelector('#rightFile');
const leftFilename = document.querySelector('#leftFilename');
const rightFilename = document.querySelector('#rightFilename');
const runCompare = document.querySelector('#runCompare');
const clearCompare = document.querySelector('#clearCompare');
const swapCompare = document.querySelector('#swapCompare');
const copyLeftText = document.querySelector('#copyLeftText');
const copyRightText = document.querySelector('#copyRightText');
const diffView = document.querySelector('#diffView');
const summaryView = document.querySelector('#diffSummary');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderCell(lineNumber, text, type) {
  const sign = type === 'added' ? '+' : type === 'removed' ? '-' : ' ';
  return `
    <div class="diff-cell ${type}">
      <span class="diff-line-number">${lineNumber ?? ''}</span>
      <span class="diff-sign">${sign}</span>
      <code>${escapeHtml(text) || ' '}</code>
    </div>
  `;
}

function renderDiff() {
  let changes;
  try {
    changes = diffLines(leftText.value, rightText.value);
  } catch (error) {
    window.alert(error.message);
    return;
  }
  const summary = diffSummary(changes);

  summaryView.innerHTML = `
    <span class="summary-added">+${summary.added} 新增</span>
    <span class="summary-removed">-${summary.removed} 删除</span>
    <span>${summary.equal} 未变化</span>
  `;

  diffView.innerHTML = changes
    .map((change) => `
      <div class="diff-row">
        ${renderCell(change.leftLine, change.left, change.type === 'removed' ? 'removed' : change.type === 'equal' ? 'equal' : 'blank')}
        ${renderCell(change.rightLine, change.right, change.type === 'added' ? 'added' : change.type === 'equal' ? 'equal' : 'blank')}
      </div>
    `)
    .join('');
}

function clearDiffResult(message = '粘贴或上传两份文本，然后点击“开始对比”') {
  summaryView.innerHTML = '<span>等待对比</span>';
  diffView.innerHTML = `<div class="empty-state">${message}</div>`;
}

async function copyTextarea(textarea, button) {
  await navigator.clipboard.writeText(textarea.value);
  const original = button.textContent;
  button.textContent = 'Copied';
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

async function uploadDocument(file, textarea, filenameLabel) {
  if (!file) return;
  filenameLabel.textContent = '正在解析...';
  const data = new FormData();
  data.set('document', file);

  try {
    const response = await fetch('/api/extract-text', {
      method: 'POST',
      body: data
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '文件解析失败');
    textarea.value = result.text;
    filenameLabel.textContent = result.filename;
  } catch (error) {
    filenameLabel.textContent = '文件解析失败';
    window.alert(error.message);
  }
}

leftFile.addEventListener('change', () => uploadDocument(leftFile.files[0], leftText, leftFilename));
rightFile.addEventListener('change', () => uploadDocument(rightFile.files[0], rightText, rightFilename));
runCompare.addEventListener('click', renderDiff);

clearCompare.addEventListener('click', () => {
  leftText.value = '';
  rightText.value = '';
  leftFile.value = '';
  rightFile.value = '';
  leftFilename.textContent = '直接粘贴或上传文件';
  rightFilename.textContent = '直接粘贴或上传文件';
  clearDiffResult();
});

swapCompare.addEventListener('click', () => {
  clearDiffResult('正在按交换后的方向重新对比...');
  [leftText.value, rightText.value] = [rightText.value, leftText.value];
  [leftFilename.textContent, rightFilename.textContent] = [rightFilename.textContent, leftFilename.textContent];
  window.requestAnimationFrame(renderDiff);
});

copyLeftText.addEventListener('click', () => {
  copyTextarea(leftText, copyLeftText).catch((error) => window.alert(error.message));
});

copyRightText.addEventListener('click', () => {
  copyTextarea(rightText, copyRightText).catch((error) => window.alert(error.message));
});
