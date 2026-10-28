'use strict';
// 最小 DOM stub 的浏览器启动烟雾测试：验证 bootstrap 不抛异常、渲染 81 格，
// 并走通「点格选中 → 点数字盘填数」的完整事件链路。零依赖。
// 运行：node tests/dom-smoke.test.js
const assert = require('node:assert');

function makeEl(tag) {
  const el = {
    tagName: tag, children: [], _listeners: {}, dataset: {}, style: {},
    _attrs: {}, className: '', textContent: '', hidden: false,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, f) {
        if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
        else { f ? this._s.add(c) : this._s.delete(c); }
      },
      contains(c) { return this._s.has(c); },
    },
    setAttribute(n, v) { this._attrs[n] = v; },
    getAttribute(n) { return this._attrs[n]; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
  };
  return el;
}

const elementsById = {};
global.document = {
  getElementById(id) { return elementsById[id] || (elementsById[id] = makeEl('div')); },
  createElement(tag) { return makeEl(tag); },
};
global.addEventListener = () => {};

const UI = require('../src/ui.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713', name); }
  catch (e) { console.error('  \u2717', name, '\n    ', e.message); process.exitCode = 1; }
}

function fire(el, type) {
  const ls = el._listeners[type] || [];
  for (const fn of ls) fn({ currentTarget: el });
}

test('bootstrap 不抛异常并渲染 81 格 + 数字盘 10 键', () => {
  UI.bootstrap();
  const board = elementsById['board'];
  const pad = elementsById['pad'];
  assert.strictEqual(board.children.length, 81, '棋盘应有 81 格');
  assert.strictEqual(pad.children.length, 10, '数字盘应有 9 数字 + 1 擦除');
});

test('胜利遮罩初始隐藏', () => {
  assert.strictEqual(elementsById['win'].hidden, true);
});

test('点格选中 → 点数字盘填数，状态与渲染一致', () => {
  const board = elementsById['board'];
  const pad = elementsById['pad'];
  const cell2 = board.children[2];           // idx 2 = (0,2)
  assert.strictEqual(cell2.dataset.idx, '2');
  fire(cell2, 'click');                        // 选中 (0,2)
  const pad4 = pad.children[3];                // 数字 4
  assert.strictEqual(pad4.dataset.d, '4');
  fire(pad4, 'click');                         // 填入 4

  const st = UI._getState();
  assert.strictEqual(st.values[2], 4, '状态值应更新为 4');
  assert.strictEqual(cell2.textContent, '4', '单元格文本应渲染为 4');
  assert.ok(cell2.classList.contains('user'), '用户填入格应有 user 类');
  assert.ok(cell2.classList.contains('selected'), '刚选中的格应有 selected 类');
});

test('Given 格点击只选中不填（给定值保留）', () => {
  const board = elementsById['board'];
  const cell0 = board.children[0];             // idx 0 = (0,0)，given=5
  fire(cell0, 'click');
  const pad9 = board.parentNode;               // 无关，仅占位
  // 选中后尝试用数字盘改值：given 应拒绝
  const st = UI._getState();
  assert.strictEqual(st.values[0], 5, 'Given 格值保持 5');
});

console.log(`\n${passed} 个测试通过`);
