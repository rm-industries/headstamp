# Headstamp

An oxlint-first plugin that validates literal source headers and inserts missing
ones safely. Supports JavaScript, TypeScript, JSX, and TSX.

This first slice supports complete literal templates. Placeholder validation and
field repair are planned in subsequent tickets.

## Requirements

- Node.js 22.18+ on the 22.x line, or Node.js 24+.
- The Node-based oxlint package, version 1.88.x. Development is pinned to 1.88.0.

Headstamp uses oxlint's `createOnce` API with a `Program` visitor. JavaScript plugins
are still an alpha oxlint feature, so compatibility is deliberately limited to the
tested release line. No benchmarked performance improvement is claimed.

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
import { defineConfig } from "oxlint";
import type { HeaderOptions } from "@rm-industries/oxlint-plugin-headstamp";

const header = {
  template: `/*
 * Copyright Acme
 */`,
} satisfies HeaderOptions;

export default defineConfig({
  jsPlugins: [
    { name: "headstamp", specifier: "@rm-industries/oxlint-plugin-headstamp" },
  ],
  overrides: [
    {
      files: ["src/**/*.{js,ts,jsx,tsx}"],
      rules: { "headstamp/header": ["error", header] },
    },
  ],
});
```

Use ordinary oxlint overrides and ignores to choose files. To store the template in
`HEADER.txt`, read it in configuration code:

```ts
import { readFileSync } from "node:fs";

const header = {
  template: readFileSync(new URL("./HEADER.txt", import.meta.url), "utf8"),
} satisfies HeaderOptions;
```

Text files are literal; their extension has no meaning to Headstamp. Configuration
can compute template text or import shared options, but the rule receives only the
resulting string. JSON oxlint configuration also works with an inline string.

## Header behavior

- Templates contain exactly one complete `/* ... */` comment or consecutive `//`
  lines. Include the delimiters and desired internal whitespace. Trailing template
  newlines are ignored; LF and CRLF templates match either source convention.
- Existing header text must match exactly, including internal whitespace. An
  incorrect or unrecognized opening comment produces a diagnostic without autofix.
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

Tests use oxlint's public rule-testing API and real CLI runs. CLI tests exercise
TypeScript configuration and exported types, external templates, supported source
languages, overrides/ignores, distinct configurations, and repeated fixes.

Implementation and tests are written in TypeScript. Both test commands strictly
typecheck source and tests, then run the TypeScript tests with Node's built-in type
stripping. The full suite builds the package first for CLI integration. Only plugin
source is emitted to the package; tests are never included in the build output.

Package output is ESM JavaScript plus TypeScript declarations. Build artifacts and
development-only files are excluded from the published package surface; inspect it
without publishing with `npm pack --dry-run`.
