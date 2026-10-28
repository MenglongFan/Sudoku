'use strict';
// 分级器测试 —— node:assert，零依赖。
// 运行：node tests/grader.test.js
const assert = require('node:assert');
const G = require('../src/grader.js');
const S = require('../src/solver.js');
const L = require('../src/logic.js');
const Gen = require('../src/generator.js');

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

// 经典报纸样例（唯一解），用于验证分级器能处理常规题。
const NEWSPAPER_GIVENS = [
  5,3,0,0,7,0,0,0,0, 6,0,0,1,9,5,0,0,0, 0,9,8,0,0,0,0,6,0,
  8,0,0,0,6,0,0,0,3, 4,0,0,8,0,3,0,0,1, 7,0,0,0,2,0,0,0,6,
  0,6,0,0,0,0,2,8,0, 0,0,0,4,1,9,0,0,5, 0,0,0,0,8,0,0,7,9,
];

test('T1：挖一格仅余唯一候选，分级为 1', () => {
  const g = SOLUTION.slice(); g[0] = 0;
  const r = G.solveLogically(g);
  assert.ok(r, '应能逻辑解开');
  assert.strictEqual(r.tier, 1, '仅用唯一候选应判 T1');
  assert.deepStrictEqual(r.solution, SOLUTION);
});

test('属性：逻辑解（若可得）必与暴力解一致且合法', () => {
  for (let k = 0; k < 40; k++) {
    const solution = Gen.fillGrid();
    const givens = Gen.carve(solution, 34);
    const r = G.solveLogically(givens);
    if (!r) continue; // 需猜测，跳过（生成器会弃）
    const brute = S.solve(givens);
    assert.ok(brute, '暴力求解应可行');
    assert.deepStrictEqual(r.solution, brute, '逻辑解须等于暴力解');
    assert.ok(L.isSolved(r.solution), '逻辑解须为合法完整解');
    // 与 givens 一致
    for (let i = 0; i < 81; i++) if (givens[i] !== 0) assert.strictEqual(r.solution[i], givens[i]);
  }
});

test('报纸样例可被逻辑求解（grade >= 1）', () => {
  const tier = G.grade({ givens: NEWSPAPER_GIVENS });
  assert.ok(tier >= 1, '常规报纸题应能逻辑解出，实际 tier=' + tier);
});

console.log(`\n${passed} 个测试通过`);
