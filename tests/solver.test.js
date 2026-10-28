'use strict';
// 求解器测试 —— node:assert，零依赖。
// 运行：node tests/solver.test.js
const assert = require('node:assert');
const S = require('../src/solver.js');
const L = require('../src/logic.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713', name); }
  catch (e) { console.error('  \u2717', name, '\n    ', e.message); process.exitCode = 1; }
}

const SOLUTION = [
  5,3,4,6,7,8,9,1,2, 6,7,2,1,9,5,3,4,8, 1,9,8,3,4,2,5,6,7,
  8,5,9,7,6,1,4,2,3, 4,2,6,8,5,3,7,9,1, 7,1,3,9,2,4,8,5,6,
  9,6,1,5,3,7,2,8,4, 2,8,7,4,1,9,6,3,5, 3,4,5,2,8,6,1,7,9,
];

test('solve：完整解原样返回', () => {
  assert.deepStrictEqual(S.solve(SOLUTION), SOLUTION);
});

test('solve：挖一格可还原唯一解', () => {
  const g = SOLUTION.slice(); g[0] = 0;
  assert.deepStrictEqual(S.solve(g), SOLUTION);
});

test('solve：返回的是完整合法解', () => {
  const g = SOLUTION.slice(); g[40] = 0;
  const r = S.solve(g);
  assert.ok(r, '应有解');
  assert.ok(L.isSolved(r), '应是无冲突的完整解');
});

test('countSolutions：完整解恰为 1', () => {
  assert.strictEqual(S.countSolutions(SOLUTION), 1);
});

test('countSolutions：挖一格仍唯一（=1）', () => {
  const g = SOLUTION.slice(); g[0] = 0;
  assert.strictEqual(S.countSolutions(g), 1);
});

test('countSolutions：空盘海量解，limit=2 即停返回 2', () => {
  assert.strictEqual(S.countSolutions(new Array(81).fill(0), 2), 2);
});

console.log(`\n${passed} 个测试通过`);
