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
