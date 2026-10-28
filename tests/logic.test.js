'use strict';
// 纯逻辑层测试 —— node:assert，零依赖。
// 运行：node tests/logic.test.js
const assert = require('node:assert');
const L = require('../src/logic.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713', name); }
  catch (e) { console.error('  \u2717', name, '\n    ', e.message); process.exitCode = 1; }
}

// 已知合法解（Wikipedia 经典样例，唯一解）
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

test('idx / rowOf / colOf / boxOf', () => {
  assert.strictEqual(L.idx(0,0), 0);
  assert.strictEqual(L.idx(8,8), 80);
  assert.strictEqual(L.idx(3,4), 31);
  assert.strictEqual(L.rowOf(31), 3);
  assert.strictEqual(L.colOf(31), 4);
  assert.strictEqual(L.boxOf(31), 4);      // 行3→宫行1，列4→宫列1 => 1*3+1=4
  assert.strictEqual(L.boxOf(L.idx(4,4)), 4);
});

test('PEERS 长度为 20 且不含自身', () => {
  for (let i = 0; i < 81; i++) {
    assert.strictEqual(L.PEERS[i].length, 20, 'peer count @' + i);
    assert.ok(!L.PEERS[i].includes(i), 'self not peer @' + i);
  }
});

test('PEERS 覆盖同行/列/宫邻居', () => {
  const peers = L.PEERS[L.idx(4,4)]; // 中心格
  // 同行(4,*)、同列(*,4)、同宫(3-5,3-5) 除自身 = 8+8+4 = 20
  assert.strictEqual(peers.length, 20);
  assert.ok(peers.includes(L.idx(4,0)));  // 同行
  assert.ok(peers.includes(L.idx(0,4)));  // 同列
  assert.ok(peers.includes(L.idx(3,3)));  // 同宫
  assert.ok(!peers.includes(L.idx(0,0))); // 无关系
});

test('位掩码 bit / maskToDigits / digitsToMask 往返', () => {
  assert.strictEqual(L.bit(1), 1);
  assert.strictEqual(L.bit(9), 256);
  assert.deepStrictEqual(L.maskToDigits(L.digitsToMask([1,3,9])), [1,3,9]);
  // maskToDigits 按位扫描，输出升序（位掩码无顺序语义，升序为规范形式）
  assert.deepStrictEqual(L.maskToDigits(L.digitsToMask([5,2,8])), [2,5,8]);
});

test('findConflicts：空盘无冲突', () => {
  assert.strictEqual(L.findConflicts(new Array(81).fill(0)).size, 0);
});

test('findConflicts：同行重复标红双方', () => {
  const v = new Array(81).fill(0);
  v[L.idx(0,0)] = 5; v[L.idx(0,3)] = 5;
  const c = L.findConflicts(v);
  assert.ok(c.has(L.idx(0,0)) && c.has(L.idx(0,3)));
  assert.strictEqual(c.size, 2);
});

test('findConflicts：同宫重复标红', () => {
  const v = new Array(81).fill(0);
  v[L.idx(0,0)] = 7; v[L.idx(1,1)] = 7; // 同宫0
  const c = L.findConflicts(v);
  assert.ok(c.has(L.idx(0,0)) && c.has(L.idx(1,1)));
});

test('findConflicts：合法解零冲突', () => {
  assert.strictEqual(L.findConflicts(SOLUTION).size, 0);
});

test('isComplete', () => {
  assert.ok(!L.isComplete(new Array(81).fill(0)));
  assert.ok(L.isComplete(SOLUTION));
});

test('isSolved：完整无冲突为真，缺格/有冲突为假', () => {
  assert.ok(L.isSolved(SOLUTION));
  const partial = SOLUTION.slice(); partial[0] = 0;
  assert.ok(!L.isSolved(partial));
  const bad = SOLUTION.slice(); bad[1] = bad[0]; // 同行重复
  assert.ok(!L.isSolved(bad));
});

test('moveSelection 边界 clamp', () => {
  assert.deepStrictEqual(L.moveSelection({r:0,c:0}, 'up'),   {r:0,c:0});
  assert.deepStrictEqual(L.moveSelection({r:0,c:0}, 'left'), {r:0,c:0});
  assert.deepStrictEqual(L.moveSelection({r:8,c:8}, 'down'), {r:8,c:8});
  assert.deepStrictEqual(L.moveSelection({r:4,c:4}, 'right'),{r:4,c:5});
  assert.deepStrictEqual(L.moveSelection({r:4,c:4}, 'up'),   {r:3,c:4});
});

test('computeCandidates：已填格返回 0', () => {
  const v = SOLUTION.slice();
  assert.strictEqual(L.computeCandidates(v, 0), 0);
});

test('computeCandidates：空格返回同行列宫未出现数字的掩码', () => {
  // 取 (0,2) 空格（SOLUTION 中=4）；其同行/列/宫已出现数字的集合
  const v = SOLUTION.slice();
  v[L.idx(0,2)] = 0;                              // 置空
  const mask = L.computeCandidates(v, L.idx(0,2));
  const digits = L.maskToDigits(mask);
  assert.deepStrictEqual(digits, [4]);             // 仅 4 合法
});

test('computeCandidates：多候选（清空多数 peer）', () => {
  const v = new Array(81).fill(0);
  // 行0 已填 1..8，仅剩 (0,8) 空 → 候选仅 9
  for (let c = 0; c < 8; c++) v[L.idx(0,c)] = c + 1;
  const mask = L.computeCandidates(v, L.idx(0,8));
  assert.deepStrictEqual(L.maskToDigits(mask), [9]);
});

console.log(`\n${passed} 个测试通过`);
