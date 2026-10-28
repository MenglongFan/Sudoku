'use strict';
// HintEngine 单元测试（纯函数，node 下运行）。
// 覆盖：冲突优先、T1 唯一候选、已解返回 null、初始盘面合法性、
// 引导求解（每步提示填正确值最终解出，覆盖 T1/T2/solution 分支）、T2 隐藏单性质。
// 运行：node tests/hint.test.js
const assert = require('node:assert');
const Logic = require('../src/logic.js');
const Hint = require('../src/hint.js');
const Generator = require('../src/generator.js');

// 经典有效解（用于确定性用例）
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

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n    ', e.message); process.exitCode = 1; }
}

// 校验提示结构完整且客观正确（digit 等于唯一解对应格）
function assertConsistent(h, solution) {
  assert.ok(h && Array.isArray(h.cells) && h.cells.length > 0, 'cells 非空');
  assert.ok(typeof h.text === 'string' && h.text.length > 0, 'text 非空');
  assert.ok(h.target >= 0 && h.target < 81, 'target 合法');
  assert.ok(h.cells.includes(h.target), 'cells 应含 target');
  if (h.digit != null) assert.strictEqual(h.digit, solution[h.target], 'digit 应等于唯一解对应格');
}

test('冲突优先：同行重复返回 conflict 且不揭示数字', () => {
  const v = SOLUTION.slice();
  v[1] = 5; // 与 v[0]=5 同行重复
  const h = Hint.getHint(v, SOLUTION, null);
  assert.strictEqual(h.type, 'conflict');
  assert.strictEqual(h.digit, null);
  assert.ok(h.cells.includes(0) && h.cells.includes(1), '冲突格应被高亮');
});

test('T1 唯一候选：仅挖空一格返回 naked-single', () => {
  const v = SOLUTION.slice();
  v[0] = 0;
  const h = Hint.getHint(v, SOLUTION, null);
  assert.strictEqual(h.type, 'technique');
  assert.strictEqual(h.technique, 'naked-single');
  assert.strictEqual(h.target, 0);
  assert.strictEqual(h.digit, 5);
  assert.deepStrictEqual(h.cells, [0]);
});

test('已解盘面（无差异）返回 null', () => {
  assert.strictEqual(Hint.getHint(SOLUTION.slice(), SOLUTION, null), null);
});

test('初始 givens 盘面：提示合法且 digit 与解一致', () => {
  const p = Generator.generateForDifficulty('medium');
  const h = Hint.getHint(Array.from(p.givens), p.solution, null);
  assert.ok(h, '应给出提示');
  assertConsistent(h, p.solution);
});

test('引导求解：每步填正确值最终解出（覆盖 T1/T2/solution）', () => {
  for (const diff of ['easy', 'medium', 'hard']) {
    const p = Generator.generateForDifficulty(diff);
    const values = Array.from(p.givens);
    let steps = 0;
    while (!Logic.isSolved(values) && steps < 200) {
      const h = Hint.getHint(values, p.solution, null);
      assert.ok(h, diff + ' 第' + steps + '步应有提示');
      assert.strictEqual(h.digit, p.solution[h.target], diff + ' 提示数字应等于解');
      values[h.target] = h.digit;
      steps++;
    }
    assert.ok(Logic.isSolved(values), diff + ' 应被提示链完整解出');
  }
});

test('T2 隐藏单：引导求解中出现且性质成立（同 unit 仅目标格含该候选）', () => {
  let seen = 0;
  for (const diff of ['easy', 'medium', 'hard']) {
    for (let t = 0; t < 4; t++) {
      const p = Generator.generateForDifficulty(diff);
      const values = Array.from(p.givens);
      let steps = 0;
      while (!Logic.isSolved(values) && steps < 200) {
        const h = Hint.getHint(values, p.solution, null);
        if (h.technique === 'hidden-single') {
          seen++;
          for (const i of h.cells) {
            const cand = Logic.computeCandidates(values, i);
            if (i !== h.target) assert.strictEqual(cand & Logic.bit(h.digit), 0, '非目标格不应含该候选');
          }
          assert.ok(h.cells.includes(h.target), 'cells 应含目标格');
        }
        values[h.target] = h.digit;
        steps++;
      }
    }
  }
  assert.ok(seen > 0, '应至少触发一次隐藏单');
});

console.log(`\n${passed} 个测试通过`);
