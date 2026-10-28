'use strict';
// 对局状态机测试 —— 零依赖。
// 运行：node tests/game.test.js
const assert = require('node:assert');
const Game = require('../src/game.js');
const Logic = require('../src/logic.js');

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

// ---- #4 候选数 ----
test('createGame 初始化 notes/mode/history/time/paused/givensCount', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  assert.ok(g.notes instanceof Uint16Array);
  assert.strictEqual(g.notes.length, 81);
  assert.strictEqual(g.mode, 'digit');
  assert.deepStrictEqual(g.history, []);
  assert.deepStrictEqual(g.future, []);
  assert.strictEqual(g.time, 0);
  assert.strictEqual(g.paused, false);
  assert.strictEqual(g.givensCount, g.givens.filter(v => v !== 0).length);
});

test('toggleNote：空非给定格翻转候选位，记录历史', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  assert.strictEqual(Game.toggleNote(g, 0, 2, 7), true);
  assert.strictEqual(g.notes[2] & Logic.bit(7), Logic.bit(7));
  assert.strictEqual(g.history.length, 1);
  // 再翻一次回到 0
  Game.toggleNote(g, 0, 2, 7);
  assert.strictEqual(g.notes[2] & Logic.bit(7), 0);
});

test('toggleNote：Given 格与已填格不可加候选', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  assert.strictEqual(Game.toggleNote(g, 0, 0, 3), false);   // (0,0)=5 给定
  assert.strictEqual(g.notes[0], 0);
  Game.setValue(g, 0, 2, 4);                                // (0,2) 落子
  assert.strictEqual(Game.toggleNote(g, 0, 2, 1), false);   // 已填格不可加
});

test('setValue 落子后清除自身候选并从同 peer 候选移除该数字', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  Game.toggleNote(g, 0, 5, 7);                              // (0,5) 空格记候选 7
  assert.strictEqual(g.notes[5] & Logic.bit(7), Logic.bit(7));
  Game.setValue(g, 0, 2, 7);                                // (0,2) 落子 7（与 (0,5) 同列同行）
  assert.strictEqual(g.notes[2], 0);                        // 自身候选清空
  assert.strictEqual(g.notes[5] & Logic.bit(7), 0);          // peer 候选移除 7
});

test('autoCandidates：空格按盘面预填，给定/已填格清零', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  Game.autoCandidates(g);
  // 给定格候选为 0
  assert.strictEqual(g.notes[0], 0);
  // 空格 (0,2) 候选应等于 computeCandidates
  assert.strictEqual(g.notes[2], Logic.computeCandidates(g.values, 2));
  // 已填用户格（先落子）候选为 0
  Game.setValue(g, 0, 2, 4);
  Game.autoCandidates(g);
  assert.strictEqual(g.notes[2], 0);
});

// ---- #5 撤销 / 重做 ----
test('setValue 记录动作；undo 回退值、redo 重放', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  assert.strictEqual(Game.canUndo(g), false);
  Game.setValue(g, 0, 2, 4);
  assert.strictEqual(g.values[2], 4);
  assert.strictEqual(Game.canUndo(g), true);
  Game.undo(g);
  assert.strictEqual(g.values[2], 0);
  assert.strictEqual(Game.canRedo(g), true);
  Game.redo(g);
  assert.strictEqual(g.values[2], 4);
  assert.strictEqual(Game.canUndo(g), true);
});

test('新动作清空重做分支', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  Game.setValue(g, 0, 2, 4);
  Game.setValue(g, 0, 3, 6);
  Game.undo(g);                       // 回退第二个动作，future 有 1 项
  assert.strictEqual(Game.canRedo(g), true);
  Game.setValue(g, 0, 5, 8);          // 新动作 → future 清空
  assert.strictEqual(Game.canRedo(g), false);
  assert.strictEqual(g.values[5], 8);
});

test('undo/redo 还原候选（落子清候选可回退）', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  Game.toggleNote(g, 0, 5, 7);        // (0,5) 记 7
  assert.strictEqual(g.notes[5] & Logic.bit(7), Logic.bit(7));
  Game.setValue(g, 0, 2, 7);          // 落子 7 清 (0,5) 候选
  assert.strictEqual(g.notes[5] & Logic.bit(7), 0);
  Game.undo(g);                       // 回退落子 → (0,5) 候选恢复
  assert.strictEqual(g.notes[5] & Logic.bit(7), Logic.bit(7));
});

test('undo 在空历史返回 false；redo 在空分支返回 false', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  assert.strictEqual(Game.undo(g), false);
  assert.strictEqual(Game.redo(g), false);
});

// ---- #5 计时 / 暂停 ----
test('tick 仅在 playing 且未暂停时累加', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  Game.tick(g); assert.strictEqual(g.time, 1);
  Game.setPaused(g, true);
  Game.tick(g); assert.strictEqual(g.time, 1);   // 暂停时不累加
  Game.setPaused(g, false);
  Game.tick(g); assert.strictEqual(g.time, 2);
});

test('胜利后 tick 不再累加', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  for (let i = 0; i < 81; i++) if (!g.givenMask[i]) Game.setValue(g, (i/9|0), i%9, SOLUTION[i]);
  assert.strictEqual(g.status, 'won');
  Game.tick(g); assert.strictEqual(g.time, 0);
});

test('formatTime 输出 mm:ss', () => {
  assert.strictEqual(Game.formatTime(0), '00:00');
  assert.strictEqual(Game.formatTime(65), '01:05');
  assert.strictEqual(Game.formatTime(600), '10:00');
});

// ---- #6 持久化 ----
test('serialize → deserialize 往返保持 values/notes/time/counters/history', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  Game.setValue(g, 0, 2, 4);
  Game.toggleNote(g, 0, 5, 7);
  Game.setPaused(g, true);
  g.time = 123; g.hintsUsed = 2; g.undosUsed = 1;
  const g2 = Game.deserialize(JSON.parse(JSON.stringify(Game.serialize(g))));
  assert.ok(g2, '反序列化应成功');
  assert.deepStrictEqual(g2.values, g.values);
  assert.deepStrictEqual(Array.from(g2.notes), Array.from(g.notes));
  assert.strictEqual(g2.time, 123);
  assert.strictEqual(g2.paused, true);
  assert.strictEqual(g2.hintsUsed, 2);
  assert.strictEqual(g2.undosUsed, 1);
  assert.strictEqual(g2.history.length, g.history.length);
  assert.deepStrictEqual(g2.givenMask, g.givenMask);
  assert.strictEqual(g2.status, 'playing');
});

test('deserialize 后 recompute 正确（胜利随 values 更新）', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  for (let i = 0; i < 81; i++) if (!g.givenMask[i]) Game.setValue(g, (i / 9 | 0), i % 9, SOLUTION[i]);
  assert.strictEqual(g.status, 'won');
  const g2 = Game.deserialize(Game.serialize(g));
  assert.strictEqual(g2.status, 'won');
  assert.strictEqual(g2.conflicts.size, 0);
});

test('deserialize 处理非法输入返回 null', () => {
  assert.strictEqual(Game.deserialize(null), null);
  assert.strictEqual(Game.deserialize({ foo: 1 }), null);
  assert.strictEqual(Game.deserialize(42), null);
  assert.strictEqual(Game.deserialize(undefined), null);
});

test('deserialize 后 undo 可回退（历史动作有效）', () => {
  const g = Game.createGame({ givens: GIVENS, solution: SOLUTION });
  Game.setValue(g, 0, 2, 4);
  Game.setValue(g, 0, 3, 6);
  const g2 = Game.deserialize(Game.serialize(g));
  Game.undo(g2);
  assert.strictEqual(g2.values[3], 0);   // 回退第二个动作
  assert.strictEqual(g2.values[2], 4);   // 第一个仍在
});

console.log(`\n${passed} 个测试通过`);
