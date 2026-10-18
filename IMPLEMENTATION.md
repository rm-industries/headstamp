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
