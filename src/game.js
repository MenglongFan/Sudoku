'use strict';
/**
 * 对局状态机（GameState + Controller 的纯逻辑部分，无 DOM）。
 * 依赖 SudokuLogic（node 下 require，浏览器下取 window.SudokuLogic）。
 * 该文件会被 build.js 内联进最终单文件 index.html。
 *
 * 本文件覆盖：
 *  - #4 候选数：notes(Uint16Array) / mode('digit'|'note') / toggleNote / autoCandidates
 *  - #5 撤销重做计时暂停：history/future 增量栈 / undo / redo / time / paused / tick / setPaused
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./logic.js'), require('./generator.js'));
  } else {
    root.SudokuGame = factory(root.SudokuLogic, root.SudokuGenerator);
  }
})(typeof self !== 'undefined' ? self : this, function (Logic, Generator) {
  'use strict';

  const bit = Logic.bit;

  // puzzle: { givens, solution, difficulty?, grade?, approximate? }
  function createGame(puzzle) {
    const givens = Array.from(puzzle.givens);
    const solution = puzzle.solution ? Array.from(puzzle.solution) : null;
    const values = givens.slice();                 // 初始 = 给定（clues 预填）
    const givenMask = givens.map(v => (v !== 0 ? 1 : 0));
    const state = {
      puzzle, givens, solution, values, givenMask,
      notes: new Uint16Array(81),                  // 每格候选位掩码（#4）
      mode: 'digit',                               // 'digit' | 'note'（#4）
      difficulty: puzzle.difficulty || 'medium',
      grade: puzzle.grade != null ? puzzle.grade : 0,
      approximate: !!puzzle.approximate,
      givensCount: givens.filter(v => v !== 0).length,
      selected: null,                              // {r,c}
      status: 'playing',                           // 'playing' | 'won'
      conflicts: new Set(),
      history: [],                                 // 增量动作栈（#5）
      future: [],                                  // 重做分支（#5）
      time: 0,                                     // 已用秒数（#5）
      paused: false,                               // 暂停态（#5）
      hintsUsed: 0,
      undosUsed: 0,
    };
    recompute(state);
    return state;
  }

  // 浏览器内生成新局（用生成器产出唯一解且按难度命中的谜题）。
  function newGame(difficulty) {
    return createGame(Generator.generateForDifficulty(difficulty || 'medium'));
  }

  function select(state, r, c) {
    if (r < 0 || r > 8 || c < 0 || c > 8) return state;
    state.selected = { r, c };
    return state;
  }

  // ---- 动作快照 / 重放（#5 增量撤销）----
  // 仅记录受影响的格子 {i, v, n}（值 + 候选），非整盘快照。
  function snapshot(state, idxs) {
    const out = new Array(idxs.length);
    for (let k = 0; k < idxs.length; k++) {
      const i = idxs[k];
      out[k] = { i, v: state.values[i], n: state.notes[i] };
    }
    return out;
  }
  function applySnapshot(state, snap) {
    for (let k = 0; k < snap.length; k++) {
      const s = snap[k];
      state.values[s.i] = s.v;
      state.notes[s.i] = s.n;
    }
  }
  function pushHistory(state, before, after, type) {
    state.history.push({ before, after, type });
    state.future.length = 0;                       // 新动作清空重做分支
  }

  // 填数 d（1..9）。Given 格或非法 d 返回 false 且不改动；成功记录动作并返回 true。
  function setValue(state, r, c, d) {
    const i = Logic.idx(r, c);
    if (state.givenMask[i]) return false;          // Given 锁
    if (!Number.isInteger(d) || d < 1 || d > 9) return false;
    const affected = [i].concat(Logic.PEERS[i]);   // 自身 + 20 个 peer（候选清理）
    const before = snapshot(state, affected);
    state.values[i] = d;
    state.notes[i] = 0;                            // 落子清空格内候选
    const bd = bit(d);
    for (let k = 0; k < Logic.PEERS[i].length; k++) {
      const p = Logic.PEERS[i][k];
      state.notes[p] &= ~bd;                       // 同行/列/宫候选移除该数字
    }
    const after = snapshot(state, affected);
    pushHistory(state, before, after, 'set');
    state.selected = { r, c };
    recompute(state);
    return true;
  }

  // 擦除。Given 格返回 false；保留手动候选（不自动重建）。
  function erase(state, r, c) {
    const i = Logic.idx(r, c);
    if (state.givenMask[i]) return false;
    if (state.values[i] === 0) return false;       // 本就为空，无动作
    const before = snapshot(state, [i]);
    state.values[i] = 0;
    const after = snapshot(state, [i]);
    pushHistory(state, before, after, 'erase');
    recompute(state);
    return true;
  }

  // 笔记模式：在单格标记/取消一个候选。仅非给定且为空格可用；返回 true/false。
  function toggleNote(state, r, c, d) {
    const i = Logic.idx(r, c);
    if (state.givenMask[i]) return false;          // 给定格不可加候选
    if (state.values[i] !== 0) return false;       // 已落子格不可加候选
    if (!Number.isInteger(d) || d < 1 || d > 9) return false;
    const before = snapshot(state, [i]);
    state.notes[i] ^= bit(d);                       // 翻转该候选位
    const after = snapshot(state, [i]);
    pushHistory(state, before, after, 'note');
    return true;
  }

  // 自动候选：按当前盘面为所有空格重算并预填候选；给定/已填格候选清零。记录为单动作（可整体撤销）。
  function autoCandidates(state) {
    const idxs = [];
    for (let i = 0; i < 81; i++) idxs.push(i);
    const before = snapshot(state, idxs);
    for (let i = 0; i < 81; i++) {
      if (state.givenMask[i] || state.values[i] !== 0) { state.notes[i] = 0; continue; }
      state.notes[i] = Logic.computeCandidates(state.values, i);
    }
    const after = snapshot(state, idxs);
    pushHistory(state, before, after, 'auto');
    return true;
  }

  // 清空全部候选（不记录历史，纯视图操作；如需可撤销可改为记录动作）。
  function clearNotes(state) {
    for (let i = 0; i < 81; i++) {
      if (!state.givenMask[i] && state.values[i] === 0) state.notes[i] = 0;
    }
    return true;
  }

  function setMode(state, mode) {
    state.mode = mode === 'note' ? 'note' : 'digit';
    return state.mode;
  }
  function toggleMode(state) {
    state.mode = state.mode === 'note' ? 'digit' : 'note';
    return state.mode;
  }

  // ---- 撤销 / 重做（#5）----
  function undo(state) {
    if (!state.history.length) return false;
    const a = state.history.pop();
    applySnapshot(state, a.before);
    state.future.push(a);
    state.undosUsed++;
    recompute(state);
    return true;
  }
  function redo(state) {
    if (!state.future.length) return false;
    const a = state.future.pop();
    applySnapshot(state, a.after);
    state.history.push(a);
    recompute(state);
    return true;
  }
  function canUndo(state) { return state.history.length > 0; }
  function canRedo(state) { return state.future.length > 0; }

  // ---- 计时 / 暂停（#5）----
  // 每秒调用一次；仅在游玩中且未暂停时累加。
  function tick(state) {
    if (state.status === 'playing' && !state.paused) state.time++;
    return state.time;
  }
  function setPaused(state, paused) {
    state.paused = !!paused;
    return state.paused;
  }

  // 根据当前 values 重算冲突与胜利状态。
  function recompute(state) {
    state.conflicts = Logic.findConflicts(state.values);
    state.status = Logic.isSolved(state.values) ? 'won' : 'playing';
    return state;
  }

  // 格式化为 mm:ss
  function formatTime(sec) {
    const s = Math.max(0, sec | 0);
    const mm = (s / 60 | 0);
    const ss = s % 60;
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }

  // ---- 持久化：序列化 / 反序列化（#6）----
  // 仅保留重建对局所需的字段；history/future 为增量动作（{i,v,n} 纯数据），可直接 JSON 化。
  function serialize(state) {
    return {
      v: 1,
      puzzle: {
        givens: Array.from(state.givens),
        solution: state.solution ? Array.from(state.solution) : null,
        difficulty: state.difficulty,
        grade: state.grade,
        approximate: state.approximate,
      },
      values: Array.from(state.values),
      notes: Array.from(state.notes),
      givenMask: state.givenMask,
      mode: state.mode,
      time: state.time,
      paused: state.paused,
      hintsUsed: state.hintsUsed,
      undosUsed: state.undosUsed,
      status: state.status,
      selected: state.selected,
      givensCount: state.givensCount,
      history: state.history,
      future: state.future,
    };
  }

  function deserialize(obj) {
    if (!obj || obj.v !== 1 || !obj.puzzle || !Array.isArray(obj.values)) return null;
    const p = obj.puzzle;
    const givens = Array.from(p.givens);
    const givenMask = (obj.givenMask && obj.givenMask.length === 81)
      ? obj.givenMask
      : givens.map(v => (v !== 0 ? 1 : 0));
    const state = {
      puzzle: {
        givens,
        solution: p.solution ? Array.from(p.solution) : null,
        difficulty: p.difficulty || 'medium',
        grade: p.grade != null ? p.grade : 0,
        approximate: !!p.approximate,
      },
      givens,
      solution: p.solution ? Array.from(p.solution) : null,
      values: Array.from(obj.values),
      givenMask,
      notes: Uint16Array.from((obj.notes && obj.notes.length === 81) ? obj.notes : new Array(81).fill(0)),
      mode: obj.mode === 'note' ? 'note' : 'digit',
      difficulty: p.difficulty || 'medium',
      grade: p.grade != null ? p.grade : 0,
      approximate: !!p.approximate,
      givensCount: obj.givensCount != null ? obj.givensCount : givens.filter(v => v !== 0).length,
      selected: obj.selected || null,
      status: obj.status === 'won' ? 'won' : 'playing',
      conflicts: new Set(),
      history: Array.isArray(obj.history) ? obj.history : [],
      future: Array.isArray(obj.future) ? obj.future : [],
      time: obj.time || 0,
      paused: !!obj.paused,
      hintsUsed: obj.hintsUsed || 0,
      undosUsed: obj.undosUsed || 0,
    };
    recompute(state);
    return state;
  }

  return {
    createGame, newGame, select,
    setValue, erase, toggleNote, autoCandidates, clearNotes,
    setMode, toggleMode,
    undo, redo, canUndo, canRedo,
    tick, setPaused,
    recompute, formatTime,
    serialize, deserialize,
  };
});
