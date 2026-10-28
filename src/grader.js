'use strict';
/**
 * 逻辑技巧分级器（纯函数，无 DOM、无副作用，可在 node 下被测试）。
 * 依赖 SudokuLogic / SudokuSolver。
 * 该文件会被 build.js 内联进最终单文件 index.html。
 *
 * 思路：在玩家/生成盘面（仅 givens）上只使用逻辑技巧推进，记录用到的最高层级；
 * 始终优先应用最低可用层，故最高层是"必需"的，难度标签诚实。
 *
 *   T1 唯一候选（Naked single）
 *   T2 隐藏单（Hidden single）
 *   T3 区块指向/声明（Locked candidates）
 *   T4 数对/三数组（Naked/Hidden pair·triple）
 *   T5 X-Wing
 *
 * grade(puzzle)     -> 用到的最高层级 1..5；无法不猜解开则返回 0（弃题重生成）
 * solveLogically(v) -> { solution, tier } 或 null（需要猜测/卡死）
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./logic.js'), require('./solver.js'));
  } else {
    root.SudokuGrader = factory(root.SudokuLogic, root.SudokuSolver);
  }
})(typeof self !== 'undefined' ? self : this, function (Logic, Solver) {
  'use strict';

  const N = 81;
  const FULL = 0x1FF;

  function popcount(m) { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; }
  // mask 恰为单比特时返回对应数字（1..9）
  function firstDigit(mask) { return 31 - Math.clz32(mask) + 1; }

  // 由已填值计算每空格的初始候选位掩码。
  function initCandidates(values) {
    const cands = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      if (values[i] !== 0) { cands[i] = 0; continue; }
      let used = 0;
      const peers = Logic.PEERS[i];
      for (let k = 0; k < peers.length; k++) {
        const v = values[peers[k]];
        if (v !== 0) used |= (1 << (v - 1));
      }
      cands[i] = (~used) & FULL;
    }
    return cands;
  }

  function combinations(arr, k) {
    const res = [];
    const n = arr.length;
    if (k > n) return res;
    const idx = new Array(k);
    (function rec(start, depth) {
      if (depth === k) { res.push(idx.slice()); return; }
      for (let i = start; i <= n - (k - depth); i++) { idx[depth] = arr[i]; rec(i + 1, depth + 1); }
    })(0, 0);
    return res;
  }

  // 在盘面 s={values,cands} 上跑纯逻辑求解。返回 {solution, tier} 或 null。
  function solveLogically(values) {
    const s = { values: values.slice(), cands: initCandidates(values) };
    let maxTier = 0;

    function place(i, d, tier) {
      s.values[i] = d;
      s.cands[i] = 0;
      if (tier > maxTier) maxTier = tier;
      const bm = 1 << (d - 1);
      const peers = Logic.PEERS[i];
      for (let k = 0; k < peers.length; k++) {
        const p = peers[k];
        if (s.values[p] === 0) s.cands[p] &= ~bm;
      }
    }
    function solved() { for (let i = 0; i < N; i++) if (s.values[i] === 0) return false; return true; }

    // T1：唯一候选
    function tryT1() {
      for (let i = 0; i < N; i++) {
        if (s.values[i] !== 0) continue;
        if (popcount(s.cands[i]) === 1) { place(i, firstDigit(s.cands[i]), 1); return true; }
      }
      return false;
    }
    // T2：隐藏单
    function tryT2() {
      for (let u = 0; u < 27; u++) {
        const unit = Logic.UNITS[u];
        for (let d = 1; d <= 9; d++) {
          const bm = 1 << (d - 1);
          let cnt = 0, last = -1;
          for (let q = 0; q < 9; q++) {
            const i = unit[q];
            if (s.values[i] !== 0) continue;
            if (s.cands[i] & bm) { cnt++; last = i; }
          }
          if (cnt === 1) { place(last, d, 2); return true; }
        }
      }
      return false;
    }
    // T3：区块指向（box→行/列）与声明（行/列→box）
    function tryT3() {
      // Case A：box 内的候选集中在同一行/列 -> 从该行/列其余格消除
      for (let b = 18; b < 27; b++) {
        const box = Logic.UNITS[b];
        for (let d = 1; d <= 9; d++) {
          const bm = 1 << (d - 1);
          const cells = [];
          for (let q = 0; q < 9; q++) { const i = box[q]; if (s.values[i] === 0 && (s.cands[i] & bm)) cells.push(i); }
          if (cells.length < 2) continue;
          const r0 = Logic.rowOf(cells[0]);
          if (cells.every(i => Logic.rowOf(i) === r0)) {
            const row = Logic.UNITS[r0], ex = new Set(cells); let ch = false;
            for (let q = 0; q < 9; q++) { const i = row[q]; if (!ex.has(i) && s.values[i] === 0 && (s.cands[i] & bm)) { s.cands[i] &= ~bm; ch = true; } }
            if (ch) { if (3 > maxTier) maxTier = 3; return true; }
          }
          const c0 = Logic.colOf(cells[0]);
          if (cells.every(i => Logic.colOf(i) === c0)) {
            const col = Logic.UNITS[9 + c0], ex = new Set(cells); let ch = false;
            for (let q = 0; q < 9; q++) { const i = col[q]; if (!ex.has(i) && s.values[i] === 0 && (s.cands[i] & bm)) { s.cands[i] &= ~bm; ch = true; } }
            if (ch) { if (3 > maxTier) maxTier = 3; return true; }
          }
        }
      }
      // Case B：行/列内的候选集中在同一 box -> 从该 box 其余格消除
      for (let u = 0; u < 18; u++) {
        const unit = Logic.UNITS[u];
        for (let d = 1; d <= 9; d++) {
          const bm = 1 << (d - 1);
          const cells = [];
          for (let q = 0; q < 9; q++) { const i = unit[q]; if (s.values[i] === 0 && (s.cands[i] & bm)) cells.push(i); }
          if (cells.length < 2) continue;
          const b0 = Logic.boxOf(cells[0]);
          if (cells.every(i => Logic.boxOf(i) === b0)) {
            const box = Logic.UNITS[18 + b0], ex = new Set(cells); let ch = false;
            for (let q = 0; q < 9; q++) { const i = box[q]; if (!ex.has(i) && s.values[i] === 0 && (s.cands[i] & bm)) { s.cands[i] &= ~bm; ch = true; } }
            if (ch) { if (3 > maxTier) maxTier = 3; return true; }
          }
        }
      }
      return false;
    }
    // T4：数对/三数组（Naked / Hidden）
    function tryT4() {
      for (let u = 0; u < 27; u++) {
        const unit = Logic.UNITS[u];
        const empties = [];
        for (let q = 0; q < 9; q++) { const i = unit[q]; if (s.values[i] === 0) empties.push(i); }
        if (empties.length < 2) continue;
        for (let n = 2; n <= 3; n++) {
          if (empties.length < n) continue;
          // Naked subset
          const combos = combinations(empties, n);
          for (const combo of combos) {
            let union = 0, ok = true;
            for (const i of combo) { if (popcount(s.cands[i]) !== n) { ok = false; break; } union |= s.cands[i]; }
            if (!ok || popcount(union) !== n) continue;
            const ex = new Set(combo); let ch = false;
            for (const i of empties) { if (ex.has(i)) continue; if (s.cands[i] & union) { s.cands[i] &= ~union; ch = true; } }
            if (ch) { if (4 > maxTier) maxTier = 4; return true; }
          }
          // Hidden subset：n 个数字的候选恰好落在同一组 n 格内 -> 这些格锁定为这 n 个数字
          const digitCells = {};
          for (let d = 1; d <= 9; d++) {
            const bm = 1 << (d - 1); const cells = [];
            for (const i of empties) if (s.cands[i] & bm) cells.push(i);
            if (cells.length >= 2 && cells.length <= n) digitCells[d] = cells;
          }
          const dl = Object.keys(digitCells).map(Number);
          if (dl.length >= n) {
            for (const dcombo of combinations(dl, n)) {
              const unionCells = new Set();
              for (const d of dcombo) for (const i of digitCells[d]) unionCells.add(i);
              if (unionCells.size !== n) continue;
              let keepMask = 0;
              for (const d of dcombo) keepMask |= (1 << (d - 1));
              const otherMask = (~keepMask) & FULL;
              let ch = false;
              for (const i of unionCells) { if (s.cands[i] & otherMask) { s.cands[i] &= ~otherMask; ch = true; } }
              if (ch) { if (4 > maxTier) maxTier = 4; return true; }
            }
          }
        }
      }
      return false;
    }
    // T5：X-Wing（两行/两列对角配对消除）
    function tryT5() {
      for (let d = 1; d <= 9; d++) {
        const bm = 1 << (d - 1);
        // 行 -> 列
        const rowCols = [];
        for (let r = 0; r < 9; r++) {
          const cols = [];
          for (let c = 0; c < 9; c++) { const i = Logic.idx(r, c); if (s.values[i] === 0 && (s.cands[i] & bm)) cols.push(c); }
          if (cols.length === 2) rowCols[r] = cols;
        }
        const rows = Object.keys(rowCols);
        for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
          const r1 = +rows[a], r2 = +rows[b], c1 = rowCols[r1][0], c2 = rowCols[r1][1];
          if (rowCols[r2][0] === c1 && rowCols[r2][1] === c2) {
            let ch = false;
            for (let r = 0; r < 9; r++) {
              if (r === r1 || r === r2) continue;
              for (const c of [c1, c2]) { const i = Logic.idx(r, c); if (s.values[i] === 0 && (s.cands[i] & bm)) { s.cands[i] &= ~bm; ch = true; } }
            }
            if (ch) { if (5 > maxTier) maxTier = 5; return true; }
          }
        }
        // 列 -> 行
        const colRows = [];
        for (let c = 0; c < 9; c++) {
          const rs = [];
          for (let r = 0; r < 9; r++) { const i = Logic.idx(r, c); if (s.values[i] === 0 && (s.cands[i] & bm)) rs.push(r); }
          if (rs.length === 2) colRows[c] = rs;
        }
        const cols = Object.keys(colRows);
        for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) {
          const c1 = +cols[a], c2 = +cols[b], r1 = colRows[c1][0], r2 = colRows[c1][1];
          if (colRows[c2][0] === r1 && colRows[c2][1] === r2) {
            let ch = false;
            for (let c = 0; c < 9; c++) {
              if (c === c1 || c === c2) continue;
              for (const r of [r1, r2]) { const i = Logic.idx(r, c); if (s.values[i] === 0 && (s.cands[i] & bm)) { s.cands[i] &= ~bm; ch = true; } }
            }
            if (ch) { if (5 > maxTier) maxTier = 5; return true; }
          }
        }
      }
      return false;
    }

    while (!solved()) {
      if (tryT1()) continue;
      if (tryT2()) continue;
      if (tryT3()) continue;
      if (tryT4()) continue;
      if (tryT5()) continue;
      return null; // 卡死：需猜测
    }
    return { solution: s.values.slice(), tier: maxTier };
  }

  function grade(puzzle) {
    const r = solveLogically(Array.from(puzzle.givens));
    return r ? r.tier : 0;
  }

  return { solveLogically, grade, _internal: { initCandidates } };
});
