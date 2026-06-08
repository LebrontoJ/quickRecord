export function diffLines(leftText, rightText) {
  const left = String(leftText || '').replace(/\r\n/g, '\n').split('\n');
  const right = String(rightText || '').replace(/\r\n/g, '\n').split('\n');
  if (left.length > 2500 || right.length > 2500) {
    throw new Error('每侧文本最多支持 2500 行，请拆分后再对比。');
  }
  const rows = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      rows[i][j] = left[i] === right[j]
        ? rows[i + 1][j + 1] + 1
        : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }

  const changes = [];
  let leftIndex = 0;
  let rightIndex = 0;
  let leftLine = 1;
  let rightLine = 1;

  while (leftIndex < left.length || rightIndex < right.length) {
    if (leftIndex < left.length && rightIndex < right.length && left[leftIndex] === right[rightIndex]) {
      changes.push({
        type: 'equal',
        left: left[leftIndex],
        right: right[rightIndex],
        leftLine,
        rightLine
      });
      leftIndex += 1;
      rightIndex += 1;
      leftLine += 1;
      rightLine += 1;
    } else if (
      rightIndex < right.length &&
      (leftIndex >= left.length || rows[leftIndex][rightIndex + 1] >= rows[leftIndex + 1][rightIndex])
    ) {
      changes.push({
        type: 'added',
        left: '',
        right: right[rightIndex],
        leftLine: null,
        rightLine
      });
      rightIndex += 1;
      rightLine += 1;
    } else {
      changes.push({
        type: 'removed',
        left: left[leftIndex],
        right: '',
        leftLine,
        rightLine: null
      });
      leftIndex += 1;
      leftLine += 1;
    }
  }

  return changes;
}

export function diffSummary(changes) {
  return changes.reduce(
    (summary, change) => {
      if (change.type === 'added') summary.added += 1;
      if (change.type === 'removed') summary.removed += 1;
      if (change.type === 'equal') summary.equal += 1;
      return summary;
    },
    { added: 0, removed: 0, equal: 0 }
  );
}
