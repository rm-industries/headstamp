# Headstamp

Status: literal headers, placeholder validation, missing-header generation, safe
existing-field repair, intentionally incomplete scaffolds, and permitted leading
comments and configurable header spacing are implemented.

## Purpose

Build a focused, oxlint-first header validation and autofix plugin.
Store header requirements in version-controlled configuration, with optional text
templates and generated replacement values.

The selected project name is Headstamp, with the private GitHub repository
`rm-industries/headstamp`. The proposed npm package is
`@rm-industries/oxlint-plugin-headstamp`; name availability and npm organization
ownership must be confirmed before publication. Package publication is a separate
follow-up action.

## Documentation requirements

Project documentation must describe this project's behavior independently. Do not
name, link to, compare against, or attribute the project to its original inspiration
in specs, READMEs, examples, release notes, or other project documentation.

## Architecture and scope

- Deliver a standalone JavaScript plugin for oxlint, using its recommended
  `createOnce` API and a `Program` visitor to check each file's header.
- Publish TypeScript types for configuration.
- Use caret ranges for development and peer dependencies, with a committed lockfile
  and reproducible CI installs through `npm ci`.
- Write implementation and tests in TypeScript, with strict typechecking of both.
  Distribute compiled JavaScript and declarations; keep tests out of package output.
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
import type { HeaderOptions } from '@rm-industries/oxlint-plugin-headstamp';
import { defineConfig } from 'oxlint';

const header = {
  template: `/*
 * Copyright {{years}} {{owner}}
 * Description: {{description}}
 */`,
  values: {
    years: {
      pattern: '\\d{4}(?:-\\d{4})?',
      replacement: String(new Date().getUTCFullYear()),
    },
    owner: {
      pattern: 'Acme',
      replacement: 'Acme',
    },
    description: {
      pattern: '\\S[^\\r\\n]*',
      replacement: '',
    },
  },
} satisfies HeaderOptions;

export default defineConfig({
  jsPlugins: [{ name: 'headstamp', specifier: '@rm-industries/oxlint-plugin-headstamp' }],
  rules: {
    'headstamp/header': ['error', header],
  },
});
```

`template` contains the complete comment, including comment delimiters. It may
contain a block comment or consecutive line comments.

To keep the template in `HEADER.txt`, ordinary configuration code reads it:

```ts
import { readFileSync } from 'node:fs';

const template = readFileSync(new URL('./HEADER.txt', import.meta.url), 'utf8');
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

| Situation                                                    | Expected behavior                                        |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Header and all fields are valid                              | Pass; no change                                          |
| Valid older year or year range                               | Preserve it; do not require the current year             |
| No opening header/comment                                    | Insert the template with replacement values              |
| Recognized header, invalid owner, valid years                | Replace owner; preserve years                            |
| Recognized header, invalid field, valid replacement          | Replace that field                                       |
| Missing header, empty description replacement                | Insert `Description: `; validation still fails           |
| Existing incomplete description, invalid replacement         | Preserve description; report it                          |
| Header has different literal wording or ambiguous boundaries | Report; do not autofix                                   |
| Unrecognized opening comment                                 | Report; do not overwrite it or insert a competing header |
| Proposed fix would make no change                            | Report without offering that fix                         |

A successful insertion can leave outstanding lint errors requiring human input.
Fixes must converge: repeating `--fix` must not continually change or duplicate the
header. Replacement strings are inserted literally, without replacement-string
metacharacter expansion.

## Permitted leading comments

The optional `allowedLeadingComments` array defaults to empty. Entries are complete
literal block comments or consecutive line-comment groups, or objects with a regex
`pattern` string. Match whole comment units including delimiters, without regex
flags; reject malformed literals, patterns, and option shapes. Normalize LF/CRLF
for matching without changing prefix bytes.

Walk only the opening prefix after any BOM/shebang. The required header takes
precedence over allowlist matches, and ambiguous header extraction remains
manual-review-only. Unknown comments stop the search without edits. Stop at code;
do not search later comments. Never split a consecutive line-comment group.

Preserve permitted text, order, and spacing. Insert or safely repair the header
after the prefix, adding only the separator needed when inserting. Consecutive
line-comment groups need a blank-line boundary so repeated fixes do not merge
them. Prefix-only files receive the header and one final newline. Preserve source
indentation, valid field values, and unfinished scaffold input; outstanding human
input remains a lint error after fixes. Cache complete options without leaking
allowlists across overrides.

The header-to-source spacing requirement is controlled by `blankLinesAfter` and
defaults to one blank line. Broader format coverage remains separate follow-up work.
No EditorConfig integration or forced line-ending conversion is introduced.

## Configurable header spacing

The optional `blankLinesAfter` number must be a nonnegative safe integer and
defaults to `1`. Require exactly this many empty lines before subsequent content;
zero still separates the header and source with a newline. Add missing or remove
excess lines only at the header boundary. Preserve permitted prefix text/spacing,
source indentation, unrelated comments, and LF/CRLF. Empty and header-only files
retain exactly one final newline regardless of the count.

If zero would merge a line header into following line-comment documentation,
report the conflict without applying that spacing edit. A block header or a count
of at least one keeps the comment groups distinct. Independently safe field
repairs remain available. Safe spacing edits also remain available when fields
need human input; preserve unfinished values and their outstanding diagnostics.

Reject invalid counts before source edits, include the option in complete cached
configuration, isolate overrides, and omit no-op fixes. Repeated fixes converge.

## Source preservation

- Preserve BOMs and shebangs; insert the header after them.
- Preserve the source file's LF or CRLF convention.
- Enforce the configured number of blank lines (default one) between the header
  and subsequent source content when comment-group safety permits the edit.
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
