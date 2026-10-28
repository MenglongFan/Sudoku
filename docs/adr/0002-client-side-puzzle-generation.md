# Puzzles are generated in the browser, not shipped as a bank

Each new game generates its puzzle client-side: fill a complete grid by backtracking, then carve cells in 180°-symmetric pairs, re-running a uniqueness check after every carve and stopping at the target difficulty tier. This keeps the single-file, zero-dependency build small and gives unlimited fresh puzzles, at the cost of a brief (millisecond-scale) generation pause when a game starts and a solver that must run on the client. A pre-baked bank was rejected: it caps how many puzzles exist and bloats the file.

_Considered: shipping a fixed set of pre-generated puzzles — instant start, but finite and a larger download._
