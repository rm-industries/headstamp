# Headstamp

An oxlint-first plugin that validates templated source headers and inserts missing
ones safely. Supports JavaScript, TypeScript, JSX, and TSX.

Supports complete literal templates and named, single-line placeholders with regex
validation. Existing-field repair and the full incomplete-scaffold workflow remain
follow-up work.

## Requirements

- Node.js 22.18+ on the 22.x line, or Node.js 24+.
- The Node-based oxlint package, version `^1.88.0` (1.88.0 or later within 1.x).

Headstamp uses oxlint's `createOnce` API with a `Program` visitor. JavaScript plugins
are still an alpha oxlint feature. CI verifies the lockfile's exact versions,
currently oxlint 1.88.0. No benchmarked performance improvement is claimed.

Development and peer dependencies use caret ranges. The committed lockfile and
`npm ci` keep installs reproducible; dependency updates must pass the same checks.

## Try the local package

The npm package has not been published. Build this checkout first:

```sh
npm ci
npm run build
```

Then install it in your consuming project:

```sh
npm install --save-dev /path/to/headstamp oxlint@1.88.0
```

## Configure

In your existing `oxlint.config.ts`:

```ts
import type { HeaderOptions } from '@rm-industries/oxlint-plugin-headstamp';
import { defineConfig } from 'oxlint';

const header = {
  template: `/*
 * Copyright {{years}} {{owner}}
 */`,
  values: {
    years: {
      pattern: '\\d{4}(?:-\\d{4})?',
      replacement: String(new Date().getUTCFullYear()),
    },
    owner: { pattern: 'Acme', replacement: 'Acme' },
  },
} satisfies HeaderOptions;

export default defineConfig({
  jsPlugins: [{ name: 'headstamp', specifier: '@rm-industries/oxlint-plugin-headstamp' }],
  overrides: [
    {
      files: ['src/**/*.{js,ts,jsx,tsx}'],
      rules: { 'headstamp/header': ['error', header] },
    },
  ],
});
```

Use ordinary oxlint overrides and ignores to choose files. To store the template in
`HEADER.txt`, read it in configuration code:

```ts
import { readFileSync } from 'node:fs';

const header = {
  template: readFileSync(new URL('./HEADER.txt', import.meta.url), 'utf8'),
} satisfies HeaderOptions;
```

Text files contain the same comment template, including placeholders; their
extension has no meaning to Headstamp. Keep the `values` map alongside the template
property when reading from a file. Configuration can compute replacement values or
import shared options, but the rule receives strings, not executable functions.
JSON oxlint configuration also works with inline template and value strings.

## Placeholders

Use `{{name}}` and define each name once in `values`, with a regex `pattern` string
and a literal `replacement` string. Names use `[A-Za-z_][A-Za-z0-9_]*`. Repeated,
undefined, or malformed placeholders and unused definitions are configuration errors.

Patterns must match the entire field value. Existing `2020` and `2020-2024` years
remain valid with the example above, even when the generated replacement is `2026`.
Regex capture groups and backreferences are local to each pattern. Replacement
strings are inserted literally, including dollar signs and backslashes.

Placeholders capture single-line values and require literal text between them. A
separator may occur inside a value if the patterns identify exactly one valid split.
Multiple valid splits produce a diagnostic without autofix. A configuration whose
otherwise-valid generated header has ambiguous field boundaries is rejected.

Invalid existing fields are reported by name when their boundaries are clear and
are left unchanged by `--fix`. Literal text identifies the header structure; changed
wording or ambiguous invalid fields require manual review.

Replacements may intentionally fail their pattern; this is not a configuration error.
They must still be single-line and preserve the complete comment. Missing-header
generation uses replacement strings, while validation uses field patterns. Full
scaffold-completion behavior is reserved for a later slice.

## Header behavior

- Templates contain exactly one complete `/* ... */` comment or consecutive `//`
  lines. Include the delimiters and desired internal whitespace. Trailing template
  newlines are ignored; LF and CRLF templates match either source convention.
- Literal header text must match exactly, including internal whitespace. Placeholder
  values must match their patterns. An incorrect or unrecognized opening comment
  produces a diagnostic without autofix.
  Consecutive opening `//` lines form one comment group: an extra line in that group
  requires manual review.
- `oxlint --fix` inserts a missing header after any shebang, preserving a BOM,
  source code, and separate later comments.
- Matching headers get one blank line before subsequent content. Indentation of
  subsequent content is retained. Leading whitespace before the header is removed.
- Empty, whitespace-only, and header-only files end with the header and exactly one
  final newline. They do not receive an empty trailing paragraph.
- Edits use the first LF or CRLF convention present in the source, defaulting to LF
  when none exists. They do not rewrite the rest of the file.
- Repeated fixes converge and never offer an edit that makes no change.
- Invalid options or malformed templates fail rather than inserting source code
  from an invalid template.

Oxlint 1.88.0 rejects a BOM immediately followed by a shebang during parsing, before
plugins run. BOM-only and shebang-only inputs are supported and tested separately;
Headstamp cannot fix a file that oxlint cannot parse.

## Development

```sh
npm run typecheck
npm run test:rule
npm test
npm run lint
npm run format:check
```

Run `npm run format` to apply Oxfmt formatting across the repository. EditorConfig
sets UTF-8, LF, final newlines, two-space indentation, and a 120-column target.
The typed Oxfmt config adds single quotes, trailing commas, and import/package
sorting. Generated files and local state are excluded through the Toptal-generated
Git ignore rules and the project's additional exclusions.

GitHub Actions checks formatting and lint on pull requests and pushes to the main
branch. A Node 22.18, 24, and 26 matrix runs strict typechecking, the package build,
all tests, and package-content inspection. CI checks formatting without rewriting
files; no release or publishing step is included.

Tests use oxlint's public rule-testing API and real CLI runs. CLI tests exercise
TypeScript configuration and exported types, external templates, supported source
languages, overrides/ignores, distinct configurations, and repeated fixes.
Placeholder tests cover historical values, whole-value matching, literal replacement
characters, malformed configuration, ambiguity, and source preservation.

Implementation and tests are written in TypeScript. Both test commands strictly
typecheck source and tests, then run the TypeScript tests with Node's built-in type
stripping. The full suite builds the package first for CLI integration. Only plugin
source is emitted to the package; tests are never included in the build output.

Package output is ESM JavaScript plus TypeScript declarations. Build artifacts and
development-only files are excluded from the published package surface; inspect it
without publishing with `npm pack --dry-run`.
