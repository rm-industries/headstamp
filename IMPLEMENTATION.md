# Literal header implementation plan — #2

Implement the approved literal-header slice from issue #2 in the current branch.
Use public rule tests and real CLI integration, as already confirmed by the user.

1. Establish the package, pinned development tools, TypeScript build and public
   plugin test. Observe a failing missing-header test, then implement insertion.
2. Add tests and implementation for block/line template validation, conflicting
   comments, exact matching, source prefixes, line endings, and spacing. Header-only
   and empty files receive a single final newline; source content gets one blank
   line after the header. Test each behavior before adding its implementation.
3. Verify the packaged exports and types through a real CLI fixture with inline and
   externally read templates, supported languages, overrides/ignores, repeated fixes,
   and multiple rule configurations. Add usage documentation matching this slice.
4. Run typechecking throughout, then all tests, lint/format checks and package checks.
   Review standards and issue coverage independently; fix findings and commit.

Files: package metadata/lockfile, TypeScript configuration, one plugin source module,
public rule tests, CLI integration tests/fixtures, README and ignore rules.
No placeholders, publishing, or unrelated machine-state changes. Preserve the
existing untracked Serena configuration. Main risks are source-offset handling and
mistaking a different opening comment for the configured header.

## Placeholder validation and generation — #3

1. Add a public rule test for generated placeholder content and observe it fail.
   Extend the public options type and prepare validated templates separately from
   oxlint's source-preservation logic.
2. Validate entire single-line field values, preserve valid historical content, and
   report invalid fields without repair. Reject malformed configuration and refuse
   ambiguous capture boundaries. Cache by complete options rather than template text.
3. Extend the same rule and CLI seams to cover configuration-generated values,
   external templates, language variants, overrides/ignores, and configuration
   isolation. Document the delivered slice and safety limits.
4. Typecheck and run focused tests throughout, then run the full suite, formatting,
   lint and package checks. Review standards and issue coverage, then commit.

Scope: public types, internal template preparation/matching, existing rule lifecycle,
TypeScript tests and usage docs. Existing-field repairs and scaffold completion
remain in #4 and #5. No new dependencies or configuration loaders.

## Safe existing-field repairs — #4

1. Add a public rule regression that repairs an invalid owner while retaining a
   valid historical year range; observe it fail before implementation.
2. Reuse unique field extraction and compiled validators to replace only invalid
   fields with valid replacement strings. Keep ambiguous structures and unsafe
   proposed repairs diagnostic-only, and preserve source text outside the header.
3. Cover literal replacement characters, invalid replacement values, line endings,
   source prefixes, and convergence at the existing rule and CLI seams. Update
   earlier diagnostic-only expectations and document repair eligibility.
4. Typecheck and run focused tests during implementation, review standards and
   issue coverage, then run final quality checks and commit on this branch.

No public options changes or new dependencies. Missing-header scaffold completion
remains in #5. Changes reach template inspection, the rule's existing fix path,
TypeScript behavioral tests, and documentation.

## Intentionally incomplete scaffolds — #5

1. Verify missing-header insertion with an intentionally invalid description at the
   agreed public rule seam. Reuse the existing generation and repair behavior;
   change production code only if a behavioral regression exposes a gap.
2. Cover unfinished user text, valid human completion, and independent repairs
   while required content remains incomplete. Use the real CLI to verify that
   insertion leaves lint unsuccessful and repeated fixes preserve the scaffold.
3. Document the completion workflow and remaining diagnostics. Typecheck and run
   focused tests throughout, then review standards/spec coverage, run the full
   suite and quality checks, and commit this slice.

Scope: TypeScript rule/CLI tests and documentation, plus narrowly necessary runtime
fixes if exposed. No new options, dependencies, or publishing steps.

## Permitted leading comments — #11

1. Add a public rule regression for recognizing a literal prefix before a header;
   observe it fail, then extend typed options and prepared matchers.
2. Walk only the opening comment prefix, prioritizing the required header and
   preserving prefix bytes. Test insertion, repair, comment grouping, source
   boundaries, and scaffold diagnostics in focused vertical slices.
3. Verify regex allowlists, invalid configuration, typed exports, override isolation,
   and repeated fixes through the agreed public rule and real CLI seams. Document
   prefix matching and preservation without adding configurable spacing or formats.
4. Typecheck throughout, review standards and issue coverage, then run the full
   suite and quality/package checks and commit on the feature branch.

## Configurable header spacing — #12

1. Add a public rule regression for zero blank lines and observe it fail. Extend
   typed options and runtime/schema validation, reusing the existing fix boundary.
2. Cover exact counts, source preservation, prefix interaction, empty/header-only
   files, repairs, incomplete scaffolds, and convergence at the approved seams.
3. Verify config isolation and malformed options through real CLI fixtures; align
   public documentation while retaining preservation of source line endings.
4. Typecheck and run focused tests throughout. Review standards and spec coverage,
   run the full suite and quality/package checks, then commit this slice.

## Npm release CI

Prepare public npm releases from deliberately published GitHub releases, with MIT
licensing matching RM Industries projects. Reuse the existing quality and Node
matrix through a callable workflow. Validate versions, pack a reviewed artifact,
and isolate OIDC permission to the publishing job. Manual runs are dry-run only.

Verify release validation and publication decisions through their CLI boundaries,
mocking only npm for publication tests. Check workflow syntax with actionlint and
exercise actual packing and dry-run publication locally. Verify the packed public
exports. Document the required npm bootstrap and trusted-publisher configuration;
no real npm publication, repository-visibility change, or credentials setup is part
of this preparation change.

## Ordinary source extensions — #13

Verify all eight JavaScript/TypeScript extensions at the agreed real CLI seam,
using source-type syntax and exact source-preservation assertions. Cover required
diagnostics, insertion, acceptance, LF/CRLF, separate BOM/shebang prefixes, and
repeated fixes. Exercise mixed-file overrides, disabled rules, and ignores with a
single CLI worker to detect configuration leakage. Record the upstream rejection
of BOM-before-shebang inputs without modifying those files. No runtime changes are
needed when these behavioral checks pass; framework investigation remains #14.

Run focused CLI tests and strict typechecking during implementation, then review
against merged main and issue #13. Finish with the complete regression suite,
formatting, lint, and package-content checks before committing.

## Framework physical-file investigation — #14

Probe Vue, Svelte, and Astro independently through the agreed real CLI seam,
using a typed observation rule and actual Headstamp fixes on temporary files.
Cover scriptless, single-script, multi-region, existing physical-header, and
unrelated-comment cases, with a separate Astro frontmatter fixture. Record source
views, ranges, physical diagnostic mapping, edit placement, preservation, and
repeated fixes. Maintain behavioral assertions for the observed blockers.

Compare local oxlint 1.88.0 results with pinned upstream source and current docs;
record separate support decisions and reproduction commands. Defer physical-file
support where callbacks or physical edit boundaries are unavailable. Preserve the
ordinary-source implementation; no parser, rewriter, or dependency is added.

Run focused CLI tests and strict typechecking, then full regression/quality/package
checks and separate standards/spec reviews before completing this branch.
