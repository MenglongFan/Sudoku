'use strict';
// 对局状态机测试 —— 零依赖。
// 运行：node tests/game.test.js
const assert = require('node:assert');
const Game = require('../src/game.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713', name); }
  catch (e) { console.error('  \u2717', name, '\n    ', e.message); process.exitCode = 1; }
}

// Wikipedia 经典样例：givens（0=空）+ 唯一解 solution
const GIVENS = [
  5,3,0, 0,7,0, 0,0,0,
  6,0,0, 1,9,5, 0,0,0,
  0,9,8, 0,0,0, 0,6,0,
  8,0,0, 0,6,0, 0,0,3,
  4,0,0, 8,0,3, 0,0,1,
  7,0,0, 0,2,0, 0,0,6,
  0,6,0, 0,0,0, 2,8,0,
  0,0,0, 4,1,9, 0,0,5,
  0,0,0, 0,8,0, 0,7,9,
];
const SOLUTION = [
  5,3,4,6,7,8,9,1,2,
  6,7,2,1,9,5,3,4,8,
  1,9,8,3,4,2,5,6,7,
  8,5,9,7,6,1,4,2,3,
  4,2,6,8,5,3,7,9,1,
  7,1,3,9,2,4,8,5,6,
  9,6,1,5,3,7,2,8,4,
  2,8,7,4,1,9,6,3,5,
  3,4,5,2,8,6,1,7,9,
];

test('createGame：初始 values == givens，给定格锁上', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  assert.deepStrictEqual(g.values, GIVENS);
  assert.strictEqual(g.givenMask[0], 1);     // (0,0)=5 是 given
  assert.strictEqual(g.givenMask[2], 0);     // (0,2)=0 非 given
  assert.strictEqual(g.status, 'playing');
});

test('Given 格不可改（setValue/erase 返回 false 且不改动）', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  assert.strictEqual(Game.setValue(g, 0, 0, 9), false);
  assert.strictEqual(g.values[0], 5);
  assert.strictEqual(Game.erase(g, 0, 0), false);
  assert.strictEqual(g.values[0], 5);
});

test('setValue 写入用户格并触发冲突/胜利重算', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  assert.strictEqual(Game.setValue(g, 0, 2, 4), true); // 正确解
  assert.strictEqual(g.values[2], 4);
  assert.deepStrictEqual(g.selected, { r: 0, c: 2 });
});

test('冲突：与宫/行内重复数字被标红（recompute 反映到 conflicts）', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  // GIVENS 第0行 = 5 3 0 0 7 ...；(1,0)=6 是给定。在 (0,2) 填 6 → 与 (1,0) 同宫冲突
  Game.setValue(g, 0, 2, 6);
  assert.ok(g.conflicts.has(2));   // idx(0,2)
  assert.ok(g.conflicts.has(9));   // idx(1,0)
});

test('胜利：填满唯一解后 status=won', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  for (let i = 0; i < 81; i++) {
    if (g.givenMask[i]) continue;
    Game.setValue(g, (i/9|0), i%9, SOLUTION[i]);
  }
  assert.strictEqual(g.status, 'won');
  assert.strictEqual(g.conflicts.size, 0);
});

test('胜利条件严格：填满但含冲突不算胜', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  for (let i = 0; i < 81; i++) {
    if (g.givenMask[i]) continue;
    let v = SOLUTION[i];
    if (i === 2) v = SOLUTION[3]; // 制造一个与 (0,3) 同行重复
    Game.setValue(g, (i/9|0), i%9, v);
  }
  assert.strictEqual(g.status, 'playing');
});

test('select 边界校验', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  Game.select(g, -1, 0); assert.strictEqual(g.selected, null);
  Game.select(g, 0, 0);  assert.deepStrictEqual(g.selected, { r: 0, c: 0 });
});

console.log(`\n${passed} 个测试通过`);
