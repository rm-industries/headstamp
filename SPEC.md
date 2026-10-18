# Headstamp

Status: agreed product scope; implementation has not started.

## Purpose

Build a focused, oxlint-first header validation and autofix plugin.
Store header requirements in version-controlled configuration, with optional text
templates and generated replacement values.

The selected project name is Headstamp, with the intended GitHub repository
`rm-industries/headstamp`. The proposed npm package is
`@rm-industries/oxlint-plugin-headstamp`; name availability and npm organization
ownership must be confirmed before creation or publication. Repository creation
and package publication are separate follow-up actions.

## Documentation requirements

Project documentation must describe this project's behavior independently. Do not
name, link to, compare against, or attribute the project to its original inspiration
in specs, READMEs, examples, release notes, or other project documentation.

## Architecture and scope

- Deliver a standalone JavaScript plugin for oxlint, using its recommended
  `createOnce` API and a `Program` visitor to check each file's header.
- Publish TypeScript types for configuration.
- Support JavaScript, TypeScript, JSX, and TSX. Use oxlint's existing overrides and
  ignores to select files.
- Configure the rule through oxlint's existing config. Do not introduce separate
  config discovery, template extension detection, or an executable text format.
- Avoid repeated template parsing and regex compilation where the plugin lifecycle
  permits reuse. Verify behavior before claiming performance improvements.

“Oxlint-first” means an optimized JavaScript plugin. It does not mean an externally
loaded native Rust plugin or an oxlint fork. ESLint compatibility is outside v1.

## Configuration

The proposed public type is `HeaderOptions`. Configure the plugin with the explicit
alias `headstamp` and rule name `headstamp/header`.

```ts
import { defineConfig } from "oxlint";
import type { HeaderOptions } from "@rm-industries/oxlint-plugin-headstamp";

const header = {
  template: `/*
 * Copyright {{years}} {{owner}}
 * Description: {{description}}
 */`,
  values: {
    years: {
      pattern: "\\d{4}(?:-\\d{4})?",
      replacement: String(new Date().getUTCFullYear()),
    },
    owner: {
      pattern: "Acme",
      replacement: "Acme",
    },
    description: {
      pattern: "\\S[^\\r\\n]*",
      replacement: "",
    },
  },
} satisfies HeaderOptions;

export default defineConfig({
  jsPlugins: [
    { name: "headstamp", specifier: "@rm-industries/oxlint-plugin-headstamp" },
  ],
  rules: {
    "headstamp/header": ["error", header],
  },
});
```

`template` contains the complete comment, including comment delimiters. It may
contain a block comment or consecutive line comments.

To keep the template in `HEADER.txt`, ordinary configuration code reads it:

```ts
import { readFileSync } from "node:fs";

const template = readFileSync(new URL("./HEADER.txt", import.meta.url), "utf8");
```

Configuration may likewise import a shared options object from another module.
Functions, file reads, and date calculations execute in configuration code. Only
strings are passed as template content, regex patterns, and replacement values to
the rule; no function transport across oxlint's configuration boundary is required.

## Template and validation contract

- Placeholder syntax is `{{name}}`.
- Each placeholder occurs once and has a corresponding entry in `values`.
- Each value has a regex pattern string and a literal replacement string.
- Patterns validate the entire captured placeholder value, not a substring.
- Placeholder values occupy a single line. Literal text separates adjacent
  placeholders; layouts that cannot be interpreted unambiguously are rejected.
- Literal template text identifies the header structure. Variable text that should
  be repairable, such as a company name, belongs in a placeholder.
- Line-ending normalization permits matching across LF and CRLF conventions.
- Invalid regexes, undefined placeholders, malformed comment templates, and
  ambiguous template layouts produce configuration errors.
- A replacement is allowed to fail its own regex intentionally. This is a supported
  scaffold, not a configuration error.

## Validation and repair behavior

Validation and generation are distinct. An existing value that matches its pattern
is valid even when it differs from the generated replacement. For example, a valid
`2020-2024` year range remains unchanged when the generated year is `2026`.

For an existing header, extract values only when the literal structure and field
boundaries are unambiguous. Preserve valid values. Replace invalid values with their
configured replacement only when that replacement passes the field's pattern.

If a replacement itself fails validation, use it to scaffold a missing header, but
preserve existing user-entered content for that field and report the validation
error. Other independently repairable fields may still be fixed.

| Situation | Expected behavior |
| --- | --- |
| Header and all fields are valid | Pass; no change |
| Valid older year or year range | Preserve it; do not require the current year |
| No opening header/comment | Insert the template with replacement values |
| Recognized header, invalid owner, valid years | Replace owner; preserve years |
| Recognized header, invalid field, valid replacement | Replace that field |
| Missing header, empty description replacement | Insert `Description: `; validation still fails |
| Existing incomplete description, invalid replacement | Preserve description; report it |
| Header has different literal wording or ambiguous boundaries | Report; do not autofix |
| Unrecognized opening comment | Report; do not overwrite it or insert a competing header |
| Proposed fix would make no change | Report without offering that fix |

A successful insertion can leave outstanding lint errors requiring human input.
Fixes must converge: repeating `--fix` must not continually change or duplicate the
header. Replacement strings are inserted literally, without replacement-string
metacharacter expansion.

## Source preservation

- Preserve BOMs and shebangs; insert the header after them.
- Preserve the source file's LF or CRLF convention.
- Enforce one blank line between the header and subsequent source content.
- Do not overwrite unrelated comments or source code.
- Files without an established line-ending convention use LF. Empty files and
  header-only files must have a documented, tested trailing-newline behavior.

## Verification and acceptance

Use oxlint's plugin testing facilities and a real CLI integration check. Cover:

1. Inline templates and templates read from files in `oxlint.config.ts`.
2. Generated dates evaluated in config and passed as strings to the rule.
3. Block and line comments across JS, TS, JSX, and TSX.
4. Full-value regex validation, valid older years, and preserved year ranges.
5. Safe partial repair, literal replacement text, and ambiguous-boundary refusal.
6. Missing headers, unrelated opening comments, and malformed header structures.
7. Intentionally invalid scaffolds, preserved user text, and remaining diagnostics
   after autofix.
8. BOMs, shebangs, LF, CRLF, blank-line normalization, and empty files.
9. Configuration errors and fix convergence, including no-op fix suppression.
10. Oxlint overrides/ignores and isolation between different rule configurations.

Do not claim benchmarked speedups without measurements. Check the current oxlint
release's plugin lifecycle and configuration loading before finalizing the package's
supported versions and Node requirements.

## Out of scope for v1

- Compatibility with ESLint plugins or legacy ESLint configs.
- Git-derived creation/modification years or automatic annual rewriting of valid dates.
- Multiline or repeated placeholders and arbitrary code inside text templates.
- Custom file selection, separate config discovery, or custom template loaders.
- Languages beyond JS, TS, JSX, and TSX.
- Deployment manifests or tracking deployed source content.

## Implementation decisions to verify

The agreed behavior must remain intact while implementation determines:

- The precise extraction algorithm and rejection criteria for ambiguous fields.
- How templates are prepared and reused safely under `createOnce` across files and
  differing configurations.
- The supported oxlint/Node versions and TypeScript config integration.
- Diagnostic locations/messages and empty/header-only file newline details.

These are implementation verification items, not authorization to broaden scope.

## References

- [Oxlint configuration](https://oxc.rs/docs/guide/usage/linter/config)
- [Writing oxlint JavaScript plugins](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html)
- [Using oxlint JavaScript plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)
