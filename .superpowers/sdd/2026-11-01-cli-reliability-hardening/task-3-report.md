# Task 3: Local runner-reserved options

## Result

Implemented local runner-reserved option validation in the existing recursive pre-dispatch traversal. Leaf `--help`, `--json-help`, and alias `-h` now produce clear configuration errors, including on help requests. Local `--version` remains parseable.

## TDD evidence

- **RED:** `node --test test/run.test.mjs` failed on the new reserved-leaf-options test (`expected 2, received 0`); the runner returned help before rejecting the leaf definition.
- **GREEN:** after implementation and build, the focused runner suite passed: 20 tests, 20 passed.

## Verification

- `node --test test/run.test.mjs` — 20 passed, 0 failed.
- `npm test` — 58 passed, 0 failed (includes build).
- `git diff --check` — passed.

## Changed files

- `src/run.ts`
- `test/run.test.mjs`

## Concerns

None known. The pre-existing untracked design and plan documents were left untouched.
