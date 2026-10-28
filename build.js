'use strict';
// 开发期拼接脚本：把内联样式 + 骨架标记 + 各段纯 JS 拼成单文件零依赖 index.html。
// 依赖顺序：logic -> solver -> grader -> generator -> game -> hint -> ui
// 运行：node build.js  -> 生成 ./index.html
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, 'src', p), 'utf8');

const css = read('styles.css');
const markup = read('markup.html');
const logic = read('logic.js');
const solver = read('solver.js');
const grader = read('grader.js');
const generator = read('generator.js');
const game = read('game.js');
const hint = read('hint.js');
const ui = read('ui.js');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>数独</title>
<style>
${css}
</style>
</head>
<body>
${markup}
<script>
${logic}
${solver}
${grader}
${generator}
${game}
${hint}
${ui}
SudokuUI.bootstrap();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'index.html'), html, 'utf8');
console.log('index.html 已生成（' + html.length + ' 字节）');
