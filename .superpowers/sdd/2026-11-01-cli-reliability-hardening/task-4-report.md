# Task 4: Complete short help candidates — report

## Outcome

Added the supported `-h` spelling to completion candidates in root, group, and leaf contexts. Bash, Zsh, and Fish scripts now emit it in all three contexts. No public API, `runCli`, or `main` changes were made.

## RED/GREEN evidence

- **RED:** Added a generated-script test before production changes. `node --test test/completion.test.mjs` failed because the generated completion scripts lacked `-h` at root, group, and leaf contexts (for example, Bash root candidates were `data --help --json-help --version`).
- **GREEN:** Added `-h` to each context candidate set and Zsh's separately assembled root options. After rebuilding, the new assertions passed for Bash, Zsh, and Fish at root, group, and leaf paths.

## Verification

- Focused: `node --test test/completion.test.mjs` — 7 passed, 0 failed.
- Full: `npm test` — build successful; 59 passed, 0 failed.
- `git diff --check` — passed.

## Changed files

- `src/completion.ts` — added `-h` to root, group, leaf, and separately emitted Zsh root candidates.
- `test/completion.test.mjs` — updated expected candidate ordering and added all-shell, all-context assertions.

## Concerns

No known functional concerns. Two unrelated untracked documentation files were present before this task and were left untouched.
