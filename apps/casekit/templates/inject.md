### Task

You are planting subtle, realistic findings into real production TypeScript code for a code-review benchmark. The commit below ("{{commitSubject}}") already landed as a real, reviewed pull request. Propose exactly one finding for each of these slots: {{slotList}}.

### How to write "find" (the step most proposals get wrong)

Each file below is listed with a line-number prefix in the exact format `N| ` -- digits, then a pipe, then one space. That prefix is reference scaffolding; it is never part of the source file, and `|` never appears in real "find"/"replace" text. Shown as windows around the lines this commit actually changed, not the whole file. A `…` marks an omitted gap between windows -- everything eligible is inside a window.

Build every "find" this way:

1. Pick the line(s) you want from the numbered listing.
2. On each line, delete only the leading `N| ` (the digits, the pipe, and the one space after it). Keep everything that follows exactly as printed -- any tabs or spaces after that point are the file's real indentation, not part of the prefix, so they stay.
3. Join the stripped lines with a single `\n` between them.
4. Copy the result into "find" character-for-character. Do not retype, reindent, reformat, or add characters (quotes, backticks, `|`) that weren't in the source.

Example -- given this listing line (`·` marks a literal space, shown only here for clarity, not in the real listing):

```
42|··return·prefix·<=·maxBits·?·{·bytes,·prefix·}·:·null;
```

the correct "find" for that line is:

```
··return·prefix·<=·maxBits·?·{·bytes,·prefix·}·:·null;
```

(strip `42| `, keep the two leading spaces that follow -- they're the file's indentation.)

### Other rules

- "find" must be an exact, verbatim, UNIQUE substring of the file. If the natural snippet repeats elsewhere in the file, widen it with a line of context until it is unique.
- The edit must fall only within the changed-line ranges listed for that file -- never touch a line the commit did not already change.
- "replace" must differ from "find".
- Keep the file syntactically valid TypeScript; do not break unrelated code.
- Place findings at least 10 lines apart, or in different functions, so no two are visible in one glance.

### Finding categories

- logic defects: a real behavioural bug (off-by-one, wrong operator, inverted condition, dropped edge case) -- something a competent developer could plausibly write by mistake, not a bug that is obvious on a glance.
- security defects: a real security-relevant regression (auth/validation bypass, injection, secret handling, unsafe default) -- same plausibility bar as logic.
- smell defects: a behaviour-PRESERVING quality issue (duplication, unclear naming, missed reuse) -- it must NOT change runtime behaviour.
- clean findings: NOT a defect. A small, behaviour-PRESERVING refactor (a rename, a local extraction) that a developer might genuinely push in response to review feedback -- it must NOT change runtime behaviour, the same bar as a smell finding, just with nothing wrong to begin with.
