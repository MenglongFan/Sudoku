'use strict';
/**
 * UI 层 + 控制器事件绑定（依赖 SudokuLogic / SudokuGame / SudokuGenerator / SudokuGrader）。
 * node 下（烟雾测试）通过 global 注入 document/window；浏览器下取 window。
 * 该文件会被 build.js 内联进最终单文件 index.html。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./logic.js'), require('./game.js'), require('./generator.js'), require('./grader.js'), global);
  } else {
    root.SudokuUI = factory(root.SudokuLogic, root.SudokuGame, root.SudokuGenerator, root.SudokuGrader, root);
  }
})(typeof self !== 'undefined' ? self : this, function (Logic, Game, Generator, Grader, docRoot) {
  'use strict';

  const DIFF_LABELS = { easy: '简单', medium: '中等', hard: '困难', expert: '专家' };

  let state = null;
  let cellEls = [];
  let doc = null;
  let boardEl = null;
  let winEl = null;
  let statusEl = null;
  let genEl = null;
  let diffSel = null;

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

    state = Game.newGame(currentDifficulty());

    buildBoard();
    buildPad();
    wireToolbar();
    wireKeyboard();
    render();
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
  }

  function wireKeyboard() {
    docRoot.addEventListener('keydown', onKeydown);
  }

  function onCellClick(e) {
    const t = e.currentTarget;
    Game.select(state, Number(t.dataset.r), Number(t.dataset.c));
    render();
  }

  function onPadClick(e) {
    if (!state.selected) return;
    const d = Number(e.currentTarget.dataset.d);
    Game.setValue(state, state.selected.r, state.selected.c, d);
    render();
  }

  function onEraseClick() {
    if (!state.selected) return;
    Game.erase(state, state.selected.r, state.selected.c);
    render();
  }

  function onKeydown(e) {
    const k = e.key;
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
      if (state.selected) { Game.setValue(state, state.selected.r, state.selected.c, Number(k)); render(); }
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
    const diff = currentDifficulty();
    if (genEl) genEl.hidden = false;
    if (statusEl) statusEl.textContent = '生成中…';
    // 让「生成中」先渲染，再跑同步生成
    setTimeout(() => {
      state = Game.newGame(diff);
      if (genEl) genEl.hidden = true;
      render();
    }, 0);
  }

  function resetGame() {
    // 重置当前谜题（清空玩家填入，保留 givens）
    state = Game.createGame(state.puzzle);
    render();
  }

  function render() {
    const sel = state.selected;
    const selIdx = sel ? Logic.idx(sel.r, sel.c) : -1;
    const selVal = selIdx >= 0 ? state.values[selIdx] : 0;
    const selPeers = selIdx >= 0 ? Logic.PEERS[selIdx] : null;

    for (let i = 0; i < 81; i++) {
      const el = cellEls[i];
      const v = state.values[i];
      el.textContent = v ? String(v) : '';

      const given = state.givenMask[i] === 1;
      el.classList.toggle('given', given);
      el.classList.toggle('user', v !== 0 && !given);
      el.classList.toggle('selected', i === selIdx);
      el.classList.toggle('conflict', state.conflicts.has(i));
      el.classList.toggle('peer', selPeers ? selPeers.includes(i) : false);
      el.classList.toggle('same', selVal !== 0 && i !== selIdx && v === selVal);
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
      statusEl.textContent = t;
    }
  }

  return { bootstrap, _getState: () => state, _cellEls: () => cellEls };
});
