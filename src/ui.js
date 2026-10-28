'use strict';
/**
 * UI 层 + 控制器事件绑定（依赖 SudokuLogic / SudokuGame）。
 * node 下（烟雾测试）通过 global 注入 document/window；浏览器下取 window。
 * 该文件会被 build.js 内联进最终单文件 index.html。
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./logic.js'), require('./game.js'), global);
  } else {
    root.SudokuUI = factory(root.SudokuLogic, root.SudokuGame, root);
  }
})(typeof self !== 'undefined' ? self : this, function (Logic, Game, docRoot) {
  'use strict';

  // #1 硬编码谜题（Wikipedia 经典样例，唯一解）—— 后续切片替换为生成器
  const PUZZLE = {
    givens: [
      5,3,0, 0,7,0, 0,0,0,
      6,0,0, 1,9,5, 0,0,0,
      0,9,8, 0,0,0, 0,6,0,
      8,0,0, 0,6,0, 0,0,3,
      4,0,0, 8,0,3, 0,0,1,
      7,0,0, 0,2,0, 0,0,6,
      0,6,0, 0,0,0, 2,8,0,
      0,0,0, 4,1,9, 0,0,5,
      0,0,0, 0,8,0, 0,7,9,
    ],
    solution: [
      5,3,4,6,7,8,9,1,2,
      6,7,2,1,9,5,3,4,8,
      1,9,8,3,4,2,5,6,7,
      8,5,9,7,6,1,4,2,3,
      4,2,6,8,5,3,7,9,1,
      7,1,3,9,2,4,8,5,6,
      9,6,1,5,3,7,2,8,4,
      2,8,7,4,1,9,6,3,5,
      3,4,5,2,8,6,1,7,9,
    ],
  };

  let state = null;
  let cellEls = [];
  let doc = null;
  let boardEl = null;
  let winEl = null;

  function bootstrap() {
    doc = docRoot.document;
    boardEl = doc.getElementById('board');
    winEl = doc.getElementById('win');
    state = Game.createGame(PUZZLE);

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
    const winReset = doc.getElementById('btn-win-reset');
    if (winReset) winReset.addEventListener('click', resetGame);
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

  function resetGame() {
    state = Game.createGame(PUZZLE);
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

    if (winEl) winEl.hidden = state.status !== 'won';
  }

  return { bootstrap, _getState: () => state, _cellEls: () => cellEls };
});
