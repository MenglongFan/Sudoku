'use strict';
/**
 * 提示引擎（HintEngine，纯函数，无 DOM、无副作用，可在 node 下被测试）。
 * 依赖 SudokuLogic（computeCandidates / findConflicts / PEERS / UNITS / bit 等）。
 * 该文件会被 build.js 内联进最终单文件 index.html。
 *
 * 契约（见 docs/design.md §4.5）：
 *  1. 若盘面存在冲突 → 返回 {type:'conflict'}，提示先修正并高亮冲突格。
 *  2. 否则推导当前候选，找全局最低层可推进技巧（T1 唯一候选 → T2 隐藏单）。
 *  3. 若无 T1/T2 可推 → 基于唯一解给出降级提示（不声称技巧名）。
 *
 * 产出统一结构：{ type, technique, tier, cells[], digit, target, text }
 *   - type: 'conflict' | 'technique' | 'solution'
 *   - technique: 'conflict' | 'naked-single' | 'hidden-single' | 'solution'
 *   - tier: 0 | 1 | 2 | 'solution'
 *   - cells: 需高亮的"相关格"索引数组
 *   - digit: 涉及数字（conflict 为 null）
 *   - target: 主目标格索引（用于更强强调）
 *   - text: 一句话解释
 *
 * 提示不修改盘面、不产生历史；调用方负责 hintsUsed++ 与高亮渲染。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./logic.js'));
  } else {
    root.SudokuHint = factory(root.SudokuLogic);
  }
})(typeof self !== 'undefined' ? self : this, function (Logic) {
  'use strict';

  function popcount(m) { let c = 0; while (m) { c += m & 1; m >>>= 1; } return c; }
  function firstDigit(mask) { return 31 - Math.clz32(mask) + 1; }
  // 单元类型标签：0..8 行、9..17 列、18..26 宫
  function unitLabel(u) { return u < 9 ? '该行' : (u < 18 ? '该列' : '该宫'); }

  // values: 当前盘面（1..9 或 0）；solution: 唯一解数组或 null；selected: {r,c}|null
  function getHint(values, solution, selected) {
    // 1. 冲突优先
    const conflicts = Logic.findConflicts(values);
    if (conflicts.size > 0) {
      const cells = Array.from(conflicts);
      return {
        type: 'conflict',
        technique: 'conflict',
        tier: 0,
        cells: cells,
        digit: null,
        target: cells[0],
        text: '盘面存在冲突：同一行 / 列 / 宫内出现重复数字。请先修正高亮的格子。',
      };
    }

    const selIdx = selected ? Logic.idx(selected.r, selected.c) : -1;

    // 2. 最低层技巧：T1 唯一候选（某空格候选只剩一个，且为正确解）
    const t1 = []; // {i, d}
    for (let i = 0; i < 81; i++) {
      if (values[i] !== 0) continue;
      const cand = Logic.computeCandidates(values, i);
      if (popcount(cand) === 1) {
        const d = firstDigit(cand);
        if (!solution || solution[i] === d) t1.push({ i, d });
      }
    }
    // T2 隐藏单：某 unit 内某数字 d 的候选仅落在一个空格（且为正确解）
    const t2 = []; // {i, d, u}
    for (let u = 0; u < 27; u++) {
      const unit = Logic.UNITS[u];
      for (let d = 1; d <= 9; d++) {
        const bm = Logic.bit(d);
        let holder = -1, cnt = 0;
        for (let q = 0; q < 9; q++) {
          const i = unit[q];
          if (values[i] === 0 && (Logic.computeCandidates(values, i) & bm)) { holder = i; cnt++; }
        }
        if (cnt === 1 && (!solution || solution[holder] === d)) {
          t2.push({ i: holder, d, u });
        }
      }
    }

    // 选择：selected 命中优先，否则全局最低层（T1 先于 T2，行优先）
    let pick = null;
    if (selIdx >= 0) pick = t1.find(x => x.i === selIdx) || t2.find(x => x.i === selIdx) || null;
    if (!pick) pick = t1[0] || t2[0] || null;

    if (pick) {
      const r = Logic.rowOf(pick.i), c = Logic.colOf(pick.i);
      if (pick.u != null) {
        // T2 隐藏单：相关格 = 该 unit 内所有空格
        const cells = Logic.UNITS[pick.u].filter(i => values[i] === 0);
        return {
          type: 'technique',
          technique: 'hidden-single',
          tier: 2,
          cells: cells,
          digit: pick.d,
          target: pick.i,
          text: 'R' + (r + 1) + 'C' + (c + 1) + ' 是' + unitLabel(pick.u) + '唯一能放 ' + pick.d + ' 的格（隐藏单 · Hidden Single）。',
        };
      }
      return {
        type: 'technique',
        technique: 'naked-single',
        tier: 1,
        cells: [pick.i],
        digit: pick.d,
        target: pick.i,
        text: 'R' + (r + 1) + 'C' + (c + 1) + ' 只剩数字 ' + pick.d + ' 一个候选（唯一候选 · Naked Single）。',
      };
    }

    // 3. 降级：基于唯一解（无 T1/T2 可推，或局面已深入至 T3+）
    if (!solution) return null;
    let target = -1, cur = 0;
    if (selIdx >= 0 && values[selIdx] !== solution[selIdx]) { target = selIdx; cur = values[selIdx]; }
    else {
      for (let i = 0; i < 81; i++) { if (values[i] !== solution[i]) { target = i; cur = values[i]; break; } }
    }
    if (target < 0) return null; // 已解且无误，无提示
    const r = Logic.rowOf(target), c = Logic.colOf(target);
    const d = solution[target];
    const text = cur === 0
      ? 'R' + (r + 1) + 'C' + (c + 1) + ' 应填入 ' + d + '（依据唯一解推导）。'
      : 'R' + (r + 1) + 'C' + (c + 1) + ' 当前填了 ' + cur + '，但正确应为 ' + d + '。';
    return {
      type: 'solution',
      technique: 'solution',
      tier: 'solution',
      cells: [target],
      digit: d,
      target: target,
      text: text,
    };
  }

  return { getHint };
});
