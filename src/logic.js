'use strict';
/**
 * Sudoku 纯逻辑层（无 DOM、无副作用，可在 node 下被测试）。
 * 同时以 UMD 形式暴露：浏览器挂到 window.SudokuLogic，node 下 module.exports。
 * 该文件会被 build.js 内联进最终单文件 index.html。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SudokuLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const N = 9;
  const CELLS = 81;

  // ---- 索引与坐标 ----
  function idx(r, c) { return r * 9 + c; }
  function rowOf(i) { return (i / 9) | 0; }
  function colOf(i) { return i % 9; }
  function boxOf(i) {
    const r = rowOf(i), c = colOf(i);
    return ((r / 3) | 0) * 3 + ((c / 3) | 0);
  }

  // ---- 预计算 peers / units ----
  // PEERS[i]: 与 i 同行/列/宫的 20 个邻居（不含自身）
  const PEERS = new Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const r = rowOf(i), c = colOf(i), b = boxOf(i);
    const set = new Set();
    for (let k = 0; k < 9; k++) { set.add(idx(r, k)); set.add(idx(k, c)); }
    const br = ((b / 3) | 0) * 3, bc = (b % 3) * 3;
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++) set.add(idx(br + dr, bc + dc));
    set.delete(i);
    PEERS[i] = Array.from(set);
  }

  // UNITS: 27 个单元（9 行 + 9 列 + 9 宫），每个 9 个索引
  const UNITS = [];
  for (let r = 0; r < 9; r++) { const u = []; for (let c = 0; c < 9; c++) u.push(idx(r, c)); UNITS.push(u); }
  for (let c = 0; c < 9; c++) { const u = []; for (let r = 0; r < 9; r++) u.push(idx(r, c)); UNITS.push(u); }
  for (let b = 0; b < 9; b++) { const u = []; const br = ((b/3)|0)*3, bc = (b%3)*3; for (let dr=0;dr<3;dr++) for (let dc=0;dc<3;dc++) u.push(idx(br+dr, bc+dc)); UNITS.push(u); }

  // ---- 位掩码（数字 d 对应 1<<(d-1)）----
  function bit(d) { return 1 << (d - 1); }
  function digitsToMask(digits) {
    let m = 0;
    for (const d of digits) if (d >= 1 && d <= 9) m |= bit(d);
    return m;
  }
  function maskToDigits(mask) {
    const out = [];
    for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
    return out;
  }

  // ---- 冲突检测 ----
  // 返回 Set<index>：与某 peer 同值（同行/列/宫重复）的所有格子。空盘返回空集。
  function findConflicts(values) {
    const conflicts = new Set();
    for (let i = 0; i < CELLS; i++) {
      const v = values[i];
      if (v === 0) continue;
      const peers = PEERS[i];
      for (let k = 0; k < peers.length; k++) {
        if (values[peers[k]] === v) { conflicts.add(i); conflicts.add(peers[k]); break; }
      }
    }
    return conflicts;
  }

  // ---- 完成 / 胜利 ----
  function isComplete(values) {
    for (let i = 0; i < CELLS; i++) if (values[i] === 0) return false;
    return true;
  }
  // 胜利：81 格填满且无冲突（唯一解前提下即正确解）
  function isSolved(values) {
    return isComplete(values) && findConflicts(values).size === 0;
  }

  function cloneValues(values) { return values.slice(); }

  // ---- 选中移动（方向键，边界 clamp）----
  function moveSelection(sel, dir) {
    if (!sel) return sel;
    let r = sel.r, c = sel.c;
    switch (dir) {
      case 'up':    r = Math.max(0, r - 1); break;
      case 'down':  r = Math.min(8, r + 1); break;
      case 'left':  c = Math.max(0, c - 1); break;
      case 'right': c = Math.min(8, c + 1); break;
      default: return sel;
    }
    return { r, c };
  }

  return {
    N, CELLS, idx, rowOf, colOf, boxOf,
    PEERS, UNITS,
    bit, digitsToMask, maskToDigits,
    findConflicts, isComplete, isSolved, cloneValues, moveSelection,
  };
});
