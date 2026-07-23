# Task 2 Report: Safe Kakao Category Search

## Scope

- Added a focused provider request test for `kakaoCategory`.
- Implemented the minimal Kakao category provider in `api-validation/poc-v2/src/providers.js`.
- Exported `kakaoCategory` from `createProviders()`.

## TDD Evidence

### RED

Command:

```bash
node --test poc-v2/test/providers.test.js
```

Observed result:

```text
✖ Kakao 카테고리 검색은 거리순 장소 요청을 만든다
TypeError: providers.kakaoCategory is not a function
```

Why this is the correct failure:

- The new test loaded `createProviders()` successfully.
- The failure was the missing production behavior, not a typo or test harness issue.

### GREEN

Minimal implementation added:

- `kakaoCategory({ category, lon, lat, radius = 1000, size = 15 })`
- Builds a Kakao category-search URL with:
  - `category_group_code`
  - `x`
  - `y`
  - `radius`
  - `sort=distance`
  - `size`
- Calls `client.json()` with Kakao auth header.
- Reuses `normalizeKakaoKeyword()` for normalized output.

Command:

```bash
node --test poc-v2/test/providers.test.js
```

Observed result:

```text
✔ Kakao 카테고리 검색은 거리순 장소 요청을 만든다
ℹ pass 1
ℹ fail 0
```

## Full Verification

### Focused diff hygiene

Command:

```bash
git diff --check -- api-validation/poc-v2/src/providers.js api-validation/poc-v2/test/providers.test.js
```

Observed result:

- No whitespace or patch-format issues reported.

### Full suite

First run inside the sandbox:

```bash
npm test
```

Observed result:

```text
✖ serve.test.js tests failed with listen EPERM: operation not permitted 127.0.0.1
```

Interpretation:

- This was an environment restriction caused by sandboxed local port binding.
- It was not caused by the provider change under Task 2.

Re-run outside the sandbox:

```bash
npm test
```

Observed result:

```text
ℹ tests 36
ℹ pass 36
ℹ fail 0
```

## Self-Review

- The new provider follows the existing `kakaoKeyword` request pattern and stays within the current provider abstraction.
- The test locks the externally important request contract:
  - endpoint path
  - category group code
  - coordinates
  - radius
  - distance sort
  - default size
  - Kakao authorization header
- No unrelated files or behavior were changed.

## Files Changed

- `api-validation/poc-v2/src/providers.js`
- `api-validation/poc-v2/test/providers.test.js`

## Risks / Notes

- `kakaoCategory` currently assumes `lon` and `lat` are present, which matches the Task 2 brief.
- Full-suite verification requires a runtime that allows localhost binding for `serve.test.js`.
