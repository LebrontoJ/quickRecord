import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, plainTextFromMarkdown, renderMarkdown } from '../public/lib/markdown.js';

test('escapeHtml escapes executable markup', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('renderMarkdown renders common journal syntax', () => {
  const html = renderMarkdown('## 复盘\n\n- 二分\n- 动态规划\n\n**重点**');
  assert.match(html, /<h2>复盘<\/h2>/);
  assert.match(html, /<li>二分<\/li>/);
  assert.match(html, /<strong>重点<\/strong>/);
});

test('renderMarkdown keeps raw html inert', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});

test('plainTextFromMarkdown produces copy-friendly text', () => {
  const text = plainTextFromMarkdown('## 标题\n\n[链接](https://example.com)\n\n```js\nalert(1)\n```');
  assert.equal(text, '标题 链接');
});
