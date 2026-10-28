'use strict';
/**
 * 对局状态机（GameState + Controller 的纯逻辑部分，无 DOM）。
 * 依赖 SudokuLogic（node 下 require，浏览器下取 window.SudokuLogic）。
 * 该文件会被 build.js 内联进最终单文件 index.html。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./logic.js'));
  } else {
    root.SudokuGame = factory(root.SudokuLogic);
  }
})(typeof self !== 'undefined' ? self : this, function (Logic) {
  'use strict';

  // puzzle: { givens: number[] (0=空,1..9), solution?: number[] }
  function createGame(puzzle) {
    const givens = Array.from(puzzle.givens);
    const solution = puzzle.solution ? Array.from(puzzle.solution) : null;
    const values = givens.slice();                 // 初始 = 给定（clues 预填）
    const givenMask = givens.map(v => (v !== 0 ? 1 : 0));
    const state = {
      puzzle, givens, solution, values, givenMask,
      selected: null,                              // {r,c}
      status: 'playing',                           // 'playing' | 'won'
      conflicts: new Set(),
    };
    recompute(state);
    return state;
  }

  function select(state, r, c) {
    if (r < 0 || r > 8 || c < 0 || c > 8) return state;
    state.selected = { r, c };
    return state;
  }

  // 填数 d（1..9）。Given 格或非法 d 返回 false 且不改动；成功返回 true。
  function setValue(state, r, c, d) {
    const i = Logic.idx(r, c);
    if (state.givenMask[i]) return false;          // Given 锁
    if (!Number.isInteger(d) || d < 1 || d > 9) return false;
    state.values[i] = d;
    state.selected = { r, c };
    recompute(state);
    return true;
  }

  // 擦除。Given 格返回 false。
  function erase(state, r, c) {
    const i = Logic.idx(r, c);
    if (state.givenMask[i]) return false;
    state.values[i] = 0;
    recompute(state);
    return true;
  }

  // 根据当前 values 重算冲突与胜利状态。
  function recompute(state) {
    state.conflicts = Logic.findConflicts(state.values);
    state.status = Logic.isSolved(state.values) ? 'won' : 'playing';
    return state;
  }

  return { createGame, select, setValue, erase, recompute };
});
