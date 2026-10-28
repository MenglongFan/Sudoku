# Sudoku

A single-player logic puzzle: fill a 9×9 grid so every row, column, and 3×3 box holds the digits 1–9 exactly once. This context is the game itself — its rules, its language, and the player's mental model of a puzzle.

## Language

**Puzzle**:
The starting grid the player is given: a 9×9 board with some cells pre-filled.
_Avoid_: Board, game, level

**Given**:
A cell whose digit is pre-filled by the puzzle and cannot be changed by the player.
_Avoid_: Clue, hint, preset, fixed

**Cell**:
One of the 81 positions on the grid, addressed by row and column.
_Avoid_: Square, tile, slot

**Box**:
One of the nine 3×3 sub-grids. Every row, column, and box must hold 1–9 exactly once.
_Avoid_: Region, block, house

**Solution**:
The unique completion of a puzzle. A well-formed puzzle has exactly one.
_Avoid_: Answer, key

**Candidate**:
A digit a player is considering for a cell, noted but not committed.
_Avoid_: Pencil mark, note, possibility

**Technique**:
A named logical deduction that advances a solve without guessing.
_Avoid_: Trick, rule, method

**Difficulty**:
A puzzle's tier, defined by the hardest Technique needed to solve it without guessing — not by how many Givens it has.
_Avoid_: Level, rating, grade

**Conflict**:
Two identical digits sharing a row, column, or box.
_Avoid_: Error, mistake, violation

**Hint**:
A nudge that names the next Technique to apply and highlights the cells involved, rather than revealing a digit.
_Avoid_: Reveal, clue, give-away

**Best**:
The fastest recorded completion time for a given Difficulty on this device.
_Avoid_: Record, high score, personal best
