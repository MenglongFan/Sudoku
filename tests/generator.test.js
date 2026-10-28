'use strict';
// 生成器测试 —— node:assert，零依赖。
// 运行：node tests/generator.test.js
const assert = require('node:assert');
const Gen = require('../src/generator.js');
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

function assertValidFullGrid(g) {
  for (let i = 0; i < 81; i++) assert.ok(g[i] >= 1 && g[i] <= 9, '非空格 @' + i);
  for (let u = 0; u < 27; u++) {
    const seen = new Set();
    for (const i of L.UNITS[u]) { assert.ok(!seen.has(g[i]), '单元内有重复 @' + i); seen.add(g[i]); }
  }
}

test('fillGrid：产出合法完整盘', () => {
  assertValidFullGrid(Gen.fillGrid());
});

test('carve：保持唯一解 + 仅删不改 + 180° 对称', () => {
  const givens = Gen.carve(SOLUTION, 30);
  assert.strictEqual(S.countSolutions(givens), 1, '挖洞后仍唯一解');
  for (let i = 0; i < 81; i++) {
    if (givens[i] !== 0) assert.strictEqual(givens[i], SOLUTION[i], '非空格须与原解一致 @' + i);
    assert.strictEqual(givens[i] !== 0, givens[80 - i] !== 0, '须 180° 对称 @' + i);
  }
});

test('generatePuzzle：唯一解且提示数为原解子集', () => {
  const p = Gen.generatePuzzle('medium');
  assert.strictEqual(S.countSolutions(p.givens), 1);
  for (let i = 0; i < 81; i++) if (p.givens[i] !== 0) assert.strictEqual(p.givens[i], p.solution[i]);
  assert.ok(p.givensCount > 0 && p.givensCount <= 81);
});

test('generateForDifficulty(easy)：可玩（逻辑可解）+ 多数落入 T1/T2', () => {
  const opts = { maxAttempts: 40, timeBudgetMs: 400 };
  let inWin = 0, playable = 0;
  for (let k = 0; k < 8; k++) {
    const p = Gen.generateForDifficulty('easy', opts);
    assert.strictEqual(S.countSolutions(p.givens), 1, '须唯一解');
    assert.ok(p.grade > 0, '须逻辑可解');
    assert.strictEqual(typeof p.approximate, 'boolean');
    playable++;
    if (p.grade >= 1 && p.grade <= 2) inWin++;
  }
  assert.ok(playable === 8, '8 局都应可玩');
  assert.ok(inWin >= 6, 'easy 应多数命中 T1/T2，实际 ' + inWin + '/8');
});

test('generateForDifficulty：四档均产出可玩且唯一解', () => {
  const opts = { maxAttempts: 40, timeBudgetMs: 400 };
  for (const diff of ['easy', 'medium', 'hard', 'expert']) {
    for (let k = 0; k < 3; k++) {
      const p = Gen.generateForDifficulty(diff, opts);
      assert.strictEqual(S.countSolutions(p.givens), 1, diff + ' 须唯一解');
      assert.ok(p.grade > 0, diff + ' 须逻辑可解');
    }
  }
});

console.log(`\n${passed} 个测试通过`);
