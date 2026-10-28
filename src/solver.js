'use strict';
/**
 * 回溯求解器（纯函数，无 DOM、无副作用，可在 node 下被测试）。
 * 依赖 SudokuLogic（node 下 require，浏览器下取 window.SudokuLogic）。
 * 该文件会被 build.js 内联进最终单文件 index.html。
 *
 * 暴露：
 *   solve(values)          -> 返回一组解（数组，0=空）或 null（无解）
 *   countSolutions(values, limit=2) -> 解的数量，数到 limit 即停（仅关心唯一性时用 2）
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./logic.js'));
  } else {
    root.SudokuSolver = factory(root.SudokuLogic);
  }
})(typeof self !== 'undefined' ? self : this, function (Logic) {
  'use strict';

  const N = 81;

  function popcount(m) { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; }

  // 在 grid（0=空）中，i 格当前能放的数字位掩码（9 位）。
  function candidatesOf(grid, i) {
    let used = 0;
    const peers = Logic.PEERS[i];
    for (let k = 0; k < peers.length; k++) {
      const v = grid[peers[k]];
      if (v !== 0) used |= (1 << (v - 1));
    }
    return (~used) & 0x1FF;
  }

  // 用最小剩余候选（MRV）选空格；返回 {i, mask} 或 null（已填满）；mask=0 表示死路。
  function pickCell(grid) {
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < N; i++) {
      if (grid[i] !== 0) continue;
      const mask = candidatesOf(grid, i);
      const cnt = popcount(mask);
      if (cnt === 0) return { i, mask: 0 };
      if (cnt < bestCount) { bestCount = cnt; best = i; bestMask = mask; if (cnt === 1) break; }
    }
    return best === -1 ? null : { i: best, mask: bestMask };
  }

  // 回溯求解：返回解数组或 null。
  function solve(values) {
    const grid = values.slice();
    function rec() {
      const pick = pickCell(grid);
      if (pick === null) return true;   // 填满即解
      if (pick.mask === 0) return false; // 死路
      const mask = pick.mask;
      for (let d = 1; d <= 9; d++) {
        if (mask & (1 << (d - 1))) {
          grid[pick.i] = d;
          if (rec()) return true;
          grid[pick.i] = 0;
        }
      }
      return false;
    }
    return rec() ? grid : null;
  }

  // 计数解的数量，数到 limit（默认 2）即停。用于唯一性判定。
  function countSolutions(values, limit) {
    if (limit === undefined) limit = 2;
    const grid = values.slice();
    let count = 0;
    function rec() {
      const pick = pickCell(grid);
      if (pick === null) { count++; return; }
      if (pick.mask === 0) return;
      const mask = pick.mask;
      for (let d = 1; d <= 9; d++) {
        if (mask & (1 << (d - 1))) {
          grid[pick.i] = d;
          rec();
          grid[pick.i] = 0;
          if (count >= limit) return;
        }
      }
    }
    rec();
    return count;
  }

  return { solve, countSolutions, _internal: { popcount, candidatesOf } };
});
