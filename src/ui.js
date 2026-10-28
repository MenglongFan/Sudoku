'use strict';
/**
 * UI 层 + 控制器事件绑定（依赖 SudokuLogic / SudokuGame / SudokuGenerator / SudokuGrader）。
 * node 下（烟雾测试）通过 global 注入 document/window；浏览器下取 window。
 * 该文件会被 build.js 内联进最终单文件 index.html。
 *
 * 本文件覆盖：
 *  - #4 候选数：笔记模式开关 + 自动候选 + 小数字网格渲染 + 键盘 N
 *  - #5 撤销/重做 + 计时/暂停：按钮 + 计时显示 + 暂停遮罩拦截输入 + 键盘快捷键
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./logic.js'), require('./game.js'), require('./generator.js'), require('./grader.js'), require('./hint.js'), global);
  } else {
    root.SudokuUI = factory(root.SudokuLogic, root.SudokuGame, root.SudokuGenerator, root.SudokuGrader, root.SudokuHint, root);
  }
})(typeof self !== 'undefined' ? self : this, function (Logic, Game, Generator, Grader, Hint, docRoot) {
  'use strict';

  const DIFF_LABELS = { easy: '简单', medium: '中等', hard: '困难', expert: '专家' };
  // 仅在浏览器（非 node 测试环境）启动计时器，避免测试进程因 setInterval 挂起。
  const IS_NODE = (typeof process !== 'undefined' && process.versions && process.versions.node);

  let state = null;
  let cellEls = [];
  let doc = null;
  let boardEl = null;
  let winEl = null;
  let statusEl = null;
  let genEl = null;
  let diffSel = null;
  let timerEl = null;
  let btnNote = null;
  let btnAutoNote = null;
  let btnUndo = null;
  let btnRedo = null;
  let btnPause = null;
  let pauseEl = null;
  let hintBtn = null;
  let hintBar = null;
  let currentHint = null;     // 当前提示对象（#7）：渲染时高亮 cells/target
  let saveTimer = null;       // 节流写盘定时器（#6）
  let recordedWin = false;    // 本局最佳成绩是否已记录（#6）

  function currentDifficulty() {
    return diffSel && diffSel.value ? diffSel.value : 'medium';
  }

  function bootstrap() {
    doc = docRoot.document;
    boardEl = doc.getElementById('board');
    winEl = doc.getElementById('win');
    statusEl = doc.getElementById('status');
    genEl = doc.getElementById('generating');
    diffSel = doc.getElementById('difficulty');
    timerEl = doc.getElementById('timer');
    btnNote = doc.getElementById('btn-note');
    btnAutoNote = doc.getElementById('btn-autonote');
    btnUndo = doc.getElementById('btn-undo');
    btnRedo = doc.getElementById('btn-redo');
    btnPause = doc.getElementById('btn-pause');
    pauseEl = doc.getElementById('pause');
    hintBtn = doc.getElementById('btn-hint');
    hintBar = doc.getElementById('hint-bar');

    buildBoard();
    buildPad();
    wireToolbar();
    wireKeyboard();

    const saved = readSave();
    if (saved && saved.status === 'playing') {
      showResume(saved);
    } else {
      startNewGame();
    }

    if (!IS_NODE) {
      setInterval(() => {
        if (!state) return;
        Game.tick(state);
        updateTimer();
      }, 1000);
    }
  }

  function buildBoard() {
    boardEl.textContent = '';
    cellEls = new Array(81);
    for (let i = 0; i < 81; i++) {
      const r = Logic.rowOf(i), c = Logic.colOf(i);
      const el = doc.createElement('button');
      el.type = 'button';
      el.className = 'cell';
      el.dataset.idx = String(i);
      el.dataset.r = String(r);
      el.dataset.c = String(c);
      if (c % 3 === 2 && c !== 8) el.classList.add('br'); // 宫右粗线
      if (r % 3 === 2 && r !== 8) el.classList.add('bb'); // 宫下粗线
      el.setAttribute('aria-label', '行' + (r + 1) + '列' + (c + 1));
      el.addEventListener('click', onCellClick);
      cellEls[i] = el;
      boardEl.appendChild(el);
    }
  }

  function buildPad() {
    const pad = doc.getElementById('pad');
    pad.textContent = '';
    for (let d = 1; d <= 9; d++) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'pad-num';
      b.textContent = String(d);
      b.dataset.d = String(d);
      b.addEventListener('click', onPadClick);
      pad.appendChild(b);
    }
    const er = doc.createElement('button');
    er.type = 'button';
    er.className = 'pad-num pad-erase';
    er.textContent = '⌫';
    er.setAttribute('aria-label', '擦除');
    er.addEventListener('click', onEraseClick);
    pad.appendChild(er);
  }

  function wireToolbar() {
    const reset = doc.getElementById('btn-reset');
    if (reset) reset.addEventListener('click', resetGame);
    const newBtn = doc.getElementById('btn-new');
    if (newBtn) newBtn.addEventListener('click', onNewGame);
    if (diffSel) diffSel.addEventListener('change', () => { /* 下次点「新局」生效，当前局不变 */ });
    const winReset = doc.getElementById('btn-win-reset');
    if (winReset) winReset.addEventListener('click', onNewGame);
    if (btnNote) btnNote.addEventListener('click', onNoteToggle);
    if (btnAutoNote) btnAutoNote.addEventListener('click', onAutoNote);
    if (btnUndo) btnUndo.addEventListener('click', onUndo);
    if (btnRedo) btnRedo.addEventListener('click', onRedo);
    if (btnPause) btnPause.addEventListener('click', togglePause);
    if (hintBtn) hintBtn.addEventListener('click', onHint);
    const resume = doc.getElementById('btn-resume');
    if (resume) resume.addEventListener('click', () => setPaused(false));
    const resumeKeep = doc.getElementById('btn-resume-keep');
    if (resumeKeep) resumeKeep.addEventListener('click', onResumeKeep);
    const resumeNew = doc.getElementById('btn-resume-new');
    if (resumeNew) resumeNew.addEventListener('click', onResumeNew);
  }

  function wireKeyboard() {
    docRoot.addEventListener('keydown', onKeydown);
  }

  // ---- #6 持久化：localStorage 封装（不可用时静默降级）----
  function lsGet() {
    try { return docRoot.localStorage || null; } catch (e) { return null; }
  }
  function readSave() {
    const ls = lsGet(); if (!ls) return null;
    try { const raw = ls.getItem('sudoku:save'); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function writeSave(st) {
    const ls = lsGet(); if (!ls || !st) return;
    try { ls.setItem('sudoku:save', JSON.stringify(Game.serialize(st))); } catch (e) {}
  }
  function clearSave() {
    const ls = lsGet(); if (!ls) return;
    try { ls.removeItem('sudoku:save'); } catch (e) {}
  }
  function readBest() {
    const ls = lsGet(); if (!ls) return {};
    try { const raw = ls.getItem('sudoku:best'); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }
  function writeBest(diff, time) {
    const ls = lsGet(); if (!ls) return;
    try {
      const best = readBest();
      if (best[diff] == null || time < best[diff]) { best[diff] = time; ls.setItem('sudoku:best', JSON.stringify(best)); }
    } catch (e) {}
  }
  // 节流写盘：~500ms 合并多次动作；仅进行中写盘（胜利后由 clearSave 处理）。
  function scheduleSave() {
    if (IS_NODE || !state) return;
    if (state.status !== 'playing') return;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (state && state.status === 'playing') writeSave(state);
    }, 500);
  }

  function startNewGame() {
    state = Game.newGame(currentDifficulty());
    recordedWin = false;
    render();
  }

  function showResume(saved) {
    const el = doc.getElementById('resume');
    if (!el) { startNewGame(); return; }
    const info = doc.getElementById('resume-info');
    if (info) {
      const lbl = DIFF_LABELS[saved.puzzle.difficulty] || saved.puzzle.difficulty;
      info.textContent = '难度 ' + lbl + ' · 已用 ' + Game.formatTime(saved.time || 0);
    }
    el.hidden = false;
  }
  function onResumeKeep() {
    const el = doc.getElementById('resume');
    const saved = readSave();
    if (saved) {
      state = Game.deserialize(saved);
      recordedWin = (state.status === 'won');
      if (el) el.hidden = true;
      render();
      if (state.paused) setPaused(true);
    } else {
      if (el) el.hidden = true;
      startNewGame();
    }
  }
  function onResumeNew() {
    clearSave();
    startNewGame();
    const el = doc.getElementById('resume');
    if (el) el.hidden = true;
  }

  function onCellClick(e) {
    if (!state || state.paused) return;
    const t = e.currentTarget;
    Game.select(state, Number(t.dataset.r), Number(t.dataset.c));
    render();
  }

  function onPadClick(e) {
    if (!state || state.paused || !state.selected) return;
    const d = Number(e.currentTarget.dataset.d);
    currentHint = null;
    if (state.mode === 'note') Game.toggleNote(state, state.selected.r, state.selected.c, d);
    else Game.setValue(state, state.selected.r, state.selected.c, d);
    render();
  }

  function onEraseClick() {
    if (!state || state.paused || !state.selected) return;
    currentHint = null;
    Game.erase(state, state.selected.r, state.selected.c);
    render();
  }

  function onNoteToggle() {
    if (!state || state.paused) return;
    currentHint = null;
    Game.toggleMode(state);
    render();
  }

  function onAutoNote() {
    if (!state || state.paused) return;
    currentHint = null;
    Game.autoCandidates(state);
    render();
  }

  function onUndo() {
    if (!state || state.paused) return;
    currentHint = null;
    if (Game.undo(state)) render();
  }

  function onRedo() {
    if (!state || state.paused) return;
    currentHint = null;
    if (Game.redo(state)) render();
  }

  function onHint() {
    if (!state || state.paused || state.status !== 'playing') return;
    const h = Hint.getHint(state.values, state.solution, state.selected);
    if (!h) {
      const had = !!currentHint;
      currentHint = null;
      if (hintBar) {
        hintBar.hidden = false;
        hintBar.classList.remove('hint-conflict');
        hintBar.textContent = '当前局面已完成（或无可提示步骤），无需提示。';
      }
      if (had) render();
      return;
    }
    state.hintsUsed++;
    currentHint = h;
    render();
  }

  function setPaused(paused) {
    if (!state) return;
    Game.setPaused(state, paused);
    if (pauseEl) pauseEl.hidden = !paused;
  }

  function togglePause() {
    if (!state) return;
    setPaused(!state.paused);
  }

  function onKeydown(e) {
    const k = e.key;
    if (!state) return;   // resume 弹窗期间忽略全部键盘输入
    // 暂停/恢复键始终可用
    if (k === 'p' || k === 'P') { togglePause(); e.preventDefault(); return; }
    if (k === 'Escape') { if (state && state.paused) { togglePause(); e.preventDefault(); } return; }
    if (state && state.paused) return; // 暂停时拦截其余输入

    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) {
      if (e.shiftKey) Game.redo(state); else Game.undo(state);
      render(); e.preventDefault(); return;
    }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) {
      Game.redo(state); render(); e.preventDefault(); return;
    }
    if (k === 'h' || k === 'H') { onHint(); e.preventDefault(); return; }
    if (k === 'n' || k === 'N') { Game.toggleMode(state); render(); e.preventDefault(); return; }

    if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') {
      if (!state.selected) state.selected = { r: 0, c: 0 };
      const dir = k === 'ArrowUp' ? 'up' : k === 'ArrowDown' ? 'down'
                : k === 'ArrowLeft' ? 'left' : 'right';
      state.selected = Logic.moveSelection(state.selected, dir);
      render();
      e.preventDefault();
      return;
    }
    if (k >= '1' && k <= '9') {
      if (state.selected) {
        if (state.mode === 'note') Game.toggleNote(state, state.selected.r, state.selected.c, Number(k));
        else Game.setValue(state, state.selected.r, state.selected.c, Number(k));
        render();
      }
      e.preventDefault();
      return;
    }
    if (k === 'Backspace' || k === 'Delete' || k === '0') {
      if (state.selected) { Game.erase(state, state.selected.r, state.selected.c); render(); }
      e.preventDefault();
    }
  }

  // 新局：先显示「生成中」，让浏览器有机会绘制，再异步生成（避免白屏）。
  function onNewGame() {
    if (!state || state.paused) return;
    const diff = currentDifficulty();
    if (genEl) genEl.hidden = false;
    if (statusEl) statusEl.textContent = '生成中…';
    // 让「生成中」先渲染，再跑同步生成
    setTimeout(() => {
      state = Game.newGame(diff);
      recordedWin = false;
      currentHint = null;
      if (genEl) genEl.hidden = true;
      render();
    }, 0);
  }

  function resetGame() {
    if (!state || state.paused) return;
    // 重置当前谜题（清空玩家填入，保留 givens）
    currentHint = null;
    state = Game.createGame(state.puzzle);
    recordedWin = false;
    render();
  }

  function notesMarkup(mask) {
    let h = '<span class="notes-grid">';
    for (let d = 1; d <= 9; d++) h += '<i>' + ((mask & Logic.bit(d)) ? d : '') + '</i>';
    h += '</span>';
    return h;
  }

  function updateTimer() {
    if (timerEl) timerEl.textContent = Game.formatTime(state ? state.time : 0);
  }

  function render() {
    if (!state) return;
    const sel = state.selected;
    const selIdx = sel ? Logic.idx(sel.r, sel.c) : -1;
    const selVal = selIdx >= 0 ? state.values[selIdx] : 0;
    const selPeers = selIdx >= 0 ? Logic.PEERS[selIdx] : null;

    for (let i = 0; i < 81; i++) {
      const el = cellEls[i];
      const v = state.values[i];

      if (v) {
        el.textContent = String(v);
        el.classList.remove('notes');
      } else if (state.notes[i]) {
        el.textContent = '';
        el.classList.add('notes');
        el.innerHTML = notesMarkup(state.notes[i]);
      } else {
        el.textContent = '';
        el.classList.remove('notes');
        el.innerHTML = '';
      }

      const given = state.givenMask[i] === 1;
      el.classList.toggle('given', given);
      el.classList.toggle('user', v !== 0 && !given);
      el.classList.toggle('selected', i === selIdx);
      el.classList.toggle('conflict', state.conflicts.has(i));
      el.classList.toggle('peer', selPeers ? selPeers.includes(i) : false);
      el.classList.toggle('same', selVal !== 0 && i !== selIdx && v === selVal);
      el.classList.toggle('hint', currentHint ? currentHint.cells.includes(i) : false);
      el.classList.toggle('hint-target', currentHint ? (i === currentHint.target) : false);
    }

    if (winEl) {
      winEl.hidden = state.status !== 'won';
      if (state.status === 'won') {
        const wt = doc.getElementById('win-text');
        if (wt) {
          const lbl = DIFF_LABELS[state.difficulty] || state.difficulty;
          wt.textContent = '棋盘已填满且唯一解正确。难度：' + lbl;
        }
      }
    }

    if (statusEl) {
      const lbl = DIFF_LABELS[state.difficulty] || state.difficulty;
      let t = '难度：' + lbl;
      if (state.grade > 0) t += ' · 技巧层级 T' + state.grade;
      if (state.approximate) t += '（近似）';
      t += ' · 提示数 ' + state.givensCount;
      if (state.hintsUsed) t += ' · 提示 ' + state.hintsUsed + ' 次';
      if (state.mode === 'note') t += ' · 笔记模式';
      statusEl.textContent = t;
    }

    updateTimer();

    if (btnNote) btnNote.setAttribute('aria-pressed', state.mode === 'note' ? 'true' : 'false');
    if (btnUndo) btnUndo.disabled = !Game.canUndo(state);
    if (btnRedo) btnRedo.disabled = !Game.canRedo(state);
    if (btnPause) btnPause.textContent = state.paused ? '继续' : '暂停';

    // 胜利时记录本难度最佳并清存档；进行中每次动作节流写盘（#6）。
    if (state.status === 'won' && !recordedWin) {
      writeBest(state.difficulty, state.time);
      const best = readBest();
      const wb = doc.getElementById('win-best');
      const bestTime = best[state.difficulty] != null ? best[state.difficulty] : state.time;
      if (wb) wb.textContent = '本难度最佳 ' + Game.formatTime(bestTime);
      clearSave();
      recordedWin = true;
    }
    // 提示条：展示当前提示文案（无提示则隐藏）。冲突提示用警示色。
    if (hintBar) {
      if (currentHint) {
        hintBar.hidden = false;
        hintBar.textContent = currentHint.text;
        hintBar.classList.toggle('hint-conflict', currentHint.type === 'conflict');
      } else {
        hintBar.hidden = true;
      }
    }

    scheduleSave();
  }

  return { bootstrap, _getState: () => state, _cellEls: () => cellEls };
});
