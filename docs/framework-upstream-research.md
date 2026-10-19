# Framework physical-file header investigation — #14

## Locally verified decision

On 2026-10-19, the public CLI probes used oxlint **1.88.0**, Node **26.9.0**,
npm **11.19.1**, and the existing Headstamp implementation (package version
**0.1.1**) on macOS arm64. The dependency lockfile pins the tools. This result is
not a claim about every version allowed by the caret range.

| Format | No scripts                              | One script                | Multiple regions                                               | Physical-file decision |
| ------ | --------------------------------------- | ------------------------- | -------------------------------------------------------------- | ---------------------- |
| Vue    | No plugin callback or header diagnostic | Script source only        | Two callbacks and two inserted banners                         | Deferred               |
| Svelte | No plugin callback or header diagnostic | Script source only        | Two callbacks and two inserted banners                         | Deferred               |
| Astro  | No plugin callback or header diagnostic | Client-script source only | Two client callbacks; frontmatter plus two scripts gives three | Deferred               |

For each format, nine cases combine no/one/multiple script regions with a missing
physical header, `<!-- Acme -->`, or an unrelated opening HTML comment. An extra
Astro case places frontmatter first, followed by two client scripts. HTML comments
are not prepended to that case because they would prevent frontmatter recognition
in this loader. A separate `.js` control proves the observation plugin loaded.
The HTML comments are physical-boundary markers, not newly supported template
syntax. Actual Headstamp runs retain its supported JS block-comment template;
the observation rule establishes why the outer HTML comments are inaccessible.

The probe rule reports `sourceCode.text`, `getText()`, filename properties,
Program/comment ranges, and diagnostic positions through oxlint's JSON reporter.
Both text APIs expose only each extracted region, with ranges beginning at local
zero. The filename properties identify the physical file, but supply neither its
complete contents nor a physical-file callback. No physical HTML header appears
in those source/comment views.

Diagnostics map back to the script's physical byte position, including when a
multibyte character precedes the script. A probe fix at local `[0, 0]` inserts
inside that script, not before its opening tag. The actual Headstamp rule behaves
likewise: a physical HTML header is not detected, a missing header in a scriptless
file passes silently, and multiple scripts receive duplicate JS banners. Exact
output assertions confirm that unrelated markup and physical comments remain
unchanged. Repeated fixes converge, but convergence inside scripts does **not**
meet the requirement for exactly one physical-file header.

All three formats fail the support gate. Do not advertise or use Headstamp for
their physical-file headers on this version. No parser, independent file reader
or rewriter, per-script policy, or production implementation change is introduced.
Use oxlint overrides/ignores to exclude these formats from a physical-header rule.
Ordinary source support remains covered separately by the eight-extension suite.

Revisit each format when oxlint exposes a physical-file callback for scriptless
files, whole physical source/comment access, and physical-boundary diagnostic/fix
ranges. Before advertising support, the complete matrix must prove detection of
an existing header, meaningful missing/invalid-header diagnostics, exactly one
safe insertion or repair, preservation outside that boundary, and repeated-fix
convergence. Passing script-region linting alone is insufficient.

## Reproduce the local evidence

```sh
npm ci
npm run build
node scripts/probe-frameworks.ts > framework-evidence.json
node --test test/frameworks.test.ts
```

The script creates and removes temporary fixtures beneath the checkout, uses only
oxlint's public CLI/plugin APIs, and prints exact tool/runtime information, source,
JSON diagnostics, edited source, and repeated-fix results for all 28 cases. The
maintained TypeScript test asserts the blockers and remapping behavior. It will
need reassessment if an upstream update changes these boundaries. Generated JSON
is local evidence, not a maintained package artifact. No framework compiler,
custom parser, or new dependency is required.

## Upstream evidence (separate from local verification)

The following is source/documentation research, not a local execution result. The upstream tag [`oxlint_v1.88.0`](https://github.com/oxc-project/oxc/tree/oxlint_v1.88.0) resolves to commit `6941b4ed45ead21c45bc2164cb80a180eed85b43`; links below pin that commit.

## Current documentation versus the pinned implementation

The [current overview](https://oxc.rs/docs/guide/usage/linter.html#what-oxlint-supports) describes `.vue`, `.svelte`, and `.astro` support as linting script blocks. The [JS-plugin page](https://oxc.rs/docs/guide/usage/linter/js-plugins.html#api-support) separately says custom formats/parsers are unsupported. These statements describe different capabilities: built-in extraction can feed ordinary JS-plugin rules, without supporting a framework parser or template AST. In the pinned source, [`SourceCode.parserServices` is empty](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/apps/oxlint/src-js/plugins/source_code.ts#L230-L234).

The [current compatibility matrix](https://oxc.rs/compatibility) says framework templates are not linted. Its requirement to install `@astrojs/compiler-rs` belongs to **Oxfmt**, not Oxlint. The pinned Oxlint Astro extractor below uses Rust string scanning; it does not call that compiler. Current docs are moving references, not a version-specific contract.

## Vue

The pinned [`VuePartialLoader`](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/loader/partial_loader/vue.rs#L23-L103) returns at most two separately extracted script bodies, reflecting normal `<script>` and `<script setup>` blocks. Each body stores its physical byte start; tags, template markup, and file-leading HTML comments are outside the body. No matching script produces an empty vector. Upstream tests explicitly cover no script, two scripts, and ignoring scripts inside HTML comments in that same file.

**Consequence inferred from the shared execution path:** a rule's `Program` callback can run twice for one physical Vue file; a template-only file produces no script `Program`. A physical-file header before `<template>`/`<script>` is unavailable through the supplied `SourceCode`. A fix at rule-local offset zero targets a script body, not physical file offset zero.

## Svelte

The pinned [`SveltePartialLoader`](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/loader/partial_loader/svelte.rs#L23-L112) also returns at most two bodies. It recognizes `module` and `context="module"` attributes, extracts `lang`, and excludes HTML comments from script discovery. Its tests cover module plus instance scripts and empty scripts, including a script tag nested in markup. This is scanning, not a full Svelte template parser.

**Consequence inferred from the shared path:** module and instance scripts become separate plugin invocations with the same physical filename; a file without discoverable script bodies provides no `Program` hook. HTML comments outside those bodies are not plugin comment tokens. Physical-file policy therefore cannot rely solely on examining the first comment of every supplied Svelte `Program`.

## Astro

The pinned [`AstroPartialLoader`](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/loader/partial_loader/astro.rs#L23-L177) extracts an optional fenced frontmatter body **and** subsequent client scripts. Frontmatter requires a first `---` fence preceded only by whitespace and a closing fence, each occupying a whitespace-only line around the delimiter. All extracted bodies use TypeScript source type. Client-script extraction loops rather than limiting the number to two. It accepts absent/empty type, `module`, and listed JavaScript MIME types, skips non-JavaScript types such as JSON/import maps, and can return empty bodies for external/self-closing script tags. Upstream tests cover frontmatter plus script and multiple script kinds.

**Consequence inferred from this code:** Astro is not merely `<script>` linting despite the overview's shorthand. Frontmatter-only files can invoke rules; files with neither recognized frontmatter nor scripts cannot. A header before the opening frontmatter fence is not in the frontmatter source; a non-whitespace header there also prevents this loader recognizing frontmatter. A header between the fences is a region header, not a header before the physical file's opening fence.

## Shared plugin source, locations, and fixes

The [`PartialLoader` dispatch](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/loader/partial_loader/mod.rs#L28-L41) returns `Some(empty)` for recognized framework files without regions. [`process_source`](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/service/runtime.rs#L1068-L1127) parses each extracted body separately; the whole-file fallback applies only to `None`, not an empty framework result. The [runtime skips linting when there are no valid section hosts](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/service/runtime.rs#L638-L682). [External rules run for each sub-host](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/lib.rs#L477-L503).

JS plugins receive the section's parsed `Program`. Before transfer, [Oxlint trims one immediately leading LF or CRLF from partial source](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/lib.rs#L736-L780), tracks that offset, and converts AST/token/comment ranges to UTF-16. [`sourceCode.text` and no-argument `getText()`](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/apps/oxlint/src-js/plugins/source_code.ts#L185-L190) return this transferred source, not surrounding physical contents. [`filename` and `physicalFilename`](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/apps/oxlint/src-js/plugins/context.ts#L326-L368) both return the same absolute physical path; neither exposes a virtual-region identity or region offset.

[Reported locations and fixes are converted back from UTF-16](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/lib.rs#L878-L958), with diagnostics clamped and fixes validated against the section. [`ContextHost` adds the physical section offset](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/context/host.rs#L336-L359). The [runtime applies accumulated fixes against the original complete file](https://github.com/oxc-project/oxc/blob/6941b4ed45ead21c45bc2164cb80a180eed85b43/crates/oxc_linter/src/service/runtime.rs#L625-L730). Thus rule-local zero is region-relative, including the removed-newline adjustment. Reading a physical file independently would not change the coordinate system accepted by `context.report` or its fixer.

## Upstream issue context and remaining uncertainty

The official [framework-parser request #8171](https://github.com/oxc-project/oxc/issues/8171) distinguishes script support from full Vue/Svelte parsing. The compatibility matrix links [Vue support issue #15761](https://github.com/oxc-project/oxc/issues/15761), which discusses missing template bindings. These are context, not proof of exact 1.88.0 behavior; pinned source is the evidence above.

This research does not establish CLI results for malformed inputs, all scanner edge cases, editor unsaved buffers, or physical-file insertion workarounds. Those require targeted execution. No implementation or dependency changes are proposed here.
