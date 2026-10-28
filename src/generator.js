'use strict';
/**
 * 谜题生成器（纯函数，无 DOM、无副作用，可在 node 下被测试）。
 * 依赖 SudokuLogic / SudokuSolver / SudokuGrader。
 * 该文件会被 build.js 内联进最终单文件 index.html。
 *
 * 流程：随机填满完整盘 -> 180° 对合成对挖洞（每挖一对用 countSolutions 校验唯一性）
 *      -> 按目标难度做技巧分级命中（有限次重试，超出预算取最接近档并标注近似）。
 *
 * 暴露：
 *   fillGrid()                       -> 完整解 Int8Array(81)
 *   carve(solution, targetGivens)    -> 挖洞后的 givens Int8Array(81)（唯一解）
 *   generatePuzzle(difficulty)       -> {givens, solution, givensCount, difficulty}
 *   generateForDifficulty(difficulty, opts) -> 上述 + {grade, approximate}（保证逻辑可解）
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./logic.js'), require('./solver.js'), require('./grader.js'));
  } else {
    root.SudokuGenerator = factory(root.SudokuLogic, root.SudokuSolver, root.SudokuGrader);
  }
})(typeof self !== 'undefined' ? self : this, function (Logic, Solver, Grader) {
  'use strict';

  const N = 81;
  const C = (g) => Int8Array.from(g);

  // 难度 -> 目标提示数（越少越难）与期望技巧层级
  const DIFFICULTY = {
    easy:   { targetGivens: 40, window: [1, 2] },
    medium: { targetGivens: 34, window: [3, 3] },
    hard:   { targetGivens: 30, window: [4, 4] },
    expert: { targetGivens: 26, window: [5, 5] },
  };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function inWindow(tier, diff) {
    const w = DIFFICULTY[diff].window;
    return tier >= w[0] && tier <= w[1];
  }

  // 随机回溯填满完整盘。
  function fillGrid() {
    const grid = new Array(N).fill(0);
    function rec(pos) {
      if (pos === N) return true;
      if (grid[pos] !== 0) return rec(pos + 1);
      const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (let k = 0; k < digits.length; k++) {
        const d = digits[k];
        let ok = true;
        const peers = Logic.PEERS[pos];
        for (let p = 0; p < peers.length; p++) { if (grid[peers[p]] === d) { ok = false; break; } }
        if (!ok) continue;
        grid[pos] = d;
        if (rec(pos + 1)) return true;
        grid[pos] = 0;
      }
      return false;
    }
    rec(0);
    return C(grid);
  }

  // 180° 对合挖洞：成对移除 (i, 80-i)，每移一对用 countSolutions 校验唯一性，破坏则还原。
  function carve(solution, targetGivens) {
    const givens = solution.slice(); // 复制为普通数组便于修改
    const pairs = [];
    for (let i = 0; i <= 40; i++) pairs.push(i); // 0..40（含中心点 40）
    shuffle(pairs);
    for (let p = 0; p < pairs.length; p++) {
      const i = pairs[p];
      const j = 80 - i;
      const hadI = givens[i] !== 0, hadJ = givens[j] !== 0;
      if (!hadI && !hadJ) continue;
      const vi = givens[i], vj = givens[j];
      givens[i] = 0; givens[j] = 0;
      if (Solver.countSolutions(givens, 2) !== 1) {
        givens[i] = vi; givens[j] = vj; // 破坏唯一性 -> 还原
      }
      let count = 0;
      for (let k = 0; k < N; k++) if (givens[k] !== 0) count++;
      if (count <= targetGivens) break;
    }
    return C(givens);
  }

  function makePuzzle(givens, solution, diff, gradeTier, approximate) {
    let count = 0;
    for (let k = 0; k < N; k++) if (givens[k] !== 0) count++;
    return {
      givens: C(givens),
      solution: C(solution),
      givensCount: count,
      difficulty: diff,
      grade: gradeTier,
      approximate: !!approximate,
    };
  }

  // 仅生成唯一解谜题（不保证逻辑可解/难度命中），供 #2 基础流程使用。
  function generatePuzzle(diff) {
    const d = DIFFICULTY[diff] ? diff : 'medium';
    const solution = fillGrid();
    const givens = carve(solution, DIFFICULTY[d].targetGivens);
    return makePuzzle(givens, solution, d, 0, false);
  }

  // 生成并按难度命中：保证逻辑可解（grade>0），尽量落入目标技巧层级窗口；
  // 超出预算则取最接近档位并标注 approximate。
  function generateForDifficulty(diff, opts) {
    const d = DIFFICULTY[diff] ? diff : 'medium';
    const o = opts || {};
    const maxAttempts = o.maxAttempts || 150;
    const timeBudgetMs = o.timeBudgetMs || 600;
    const t0 = Date.now();
    const w = DIFFICULTY[d].window;
    const target = (w[0] + w[1]) / 2;

    let best = null, bestDiff = Infinity;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const solution = fillGrid();
      const givens = carve(solution, DIFFICULTY[d].targetGivens);
      const tier = Grader.grade({ givens, solution });
      if (tier === 0) continue; // 需猜测，弃
      if (inWindow(tier, d)) return makePuzzle(givens, solution, d, tier, false);
      const dist = Math.abs(tier - target);
      if (dist < bestDiff) { bestDiff = dist; best = makePuzzle(givens, solution, d, tier, true); }
      if (Date.now() - t0 > timeBudgetMs) break;
    }

    if (best) return best;

    // 兜底：放宽提示数（更易），直到出现逻辑可解盘，确保总能开局。
    let tg = DIFFICULTY[d].targetGivens + 4;
    for (let attempt = 0; attempt < maxAttempts && tg <= 60; attempt++) {
      const solution = fillGrid();
      const givens = carve(solution, tg);
      const tier = Grader.grade({ givens, solution });
      if (tier > 0) return makePuzzle(givens, solution, d, tier, true);
      if (attempt % 12 === 11) tg += 2;
    }
    // 极端兜底：返回满分提示数的逻辑可解盘（必然存在）
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const solution = fillGrid();
      const givens = carve(solution, 60);
      const tier = Grader.grade({ givens, solution });
      if (tier > 0) return makePuzzle(givens, solution, d, tier, true);
    }
    // 理论上不可达：返回最简单兜底（fillGrid 已合法，仅透出解）
    const solution = fillGrid();
    return makePuzzle(solution, solution, d, 0, true);
  }

  return {
    DIFFICULTY, fillGrid, carve, generatePuzzle, generateForDifficulty,
    _internal: { inWindow, shuffle },
  };
});
