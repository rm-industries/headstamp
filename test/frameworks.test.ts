import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

type Diagnostic = {
  message: string;
  code: string;
  filename: string;
  labels: { span: { offset: number; length: number; line: number; column: number } }[];
};
type Run = { status: number; output: { diagnostics: Diagnostic[]; number_of_files: number }; stderr: string };
type Observation = {
  text: string;
  getText: string;
  filename: string;
  physicalFilename: string;
  range: number[];
  comments: number[][];
};
type Case = {
  format: string;
  scripts: string;
  header: string;
  source: string;
  probe: Run;
  editProbe: Run;
  probeFixed: string;
  before: Run;
  fixed: Run;
  after: string;
  repeated: Run;
  converged: boolean;
};

const root = fileURLToPath(new URL('../', import.meta.url));

test('framework CLI evidence defers physical-file support for Vue, Svelte, and Astro', async (t) => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/probe-frameworks.ts')], {
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report: { oxlint: string; control: Run; results: Case[] } = JSON.parse(result.stdout);
  const installed = JSON.parse(readFileSync(join(root, 'node_modules/oxlint/package.json'), 'utf8'));
  assert.equal(report.oxlint, `Version: ${installed.version}`);
  assert.equal(report.control.status, 1);
  assert.equal(report.control.output.diagnostics.length, 1);
  assert.match(report.control.output.diagnostics[0].message, /^HEADSTAMP_PROBE:/);
  assert.equal(report.results.length, 28);
  for (const format of ['vue', 'svelte', 'astro']) {
    await t.test(format, () => {
      const cases = report.results.filter((row) => row.format === format);
      const matrix = cases.filter((row) => row.scripts !== 'frontmatter');
      assert.deepEqual(matrix.map(({ scripts, header }) => `${scripts}/${header}`).sort(), [
        'multiple/existing',
        'multiple/missing',
        'multiple/unrelated',
        'none/existing',
        'none/missing',
        'none/unrelated',
        'one/existing',
        'one/missing',
        'one/unrelated',
      ]);
      assert.equal(cases.length, format === 'astro' ? 10 : 9);
      for (const row of cases) {
        const expectedRegions =
          row.scripts === 'none' ? 0 : row.scripts === 'one' ? 1 : row.scripts === 'frontmatter' ? 3 : 2;
        assert.equal(row.probe.output.number_of_files, 1);
        assert.equal(row.probe.output.diagnostics.length, expectedRegions);
        assert.equal(row.before.output.diagnostics.length, expectedRegions);
        assert.equal(row.before.status, expectedRegions === 0 ? 0 : 1);
        assert.equal(row.fixed.status, 0);
        assert.equal(row.repeated.status, 0);
        assert.equal(row.repeated.output.diagnostics.length, 0);
        assert.equal(row.converged, true);
        if (expectedRegions === 0) {
          assert.equal(row.probe.status, 0);
          assert.equal(row.after, row.source);
          assert.equal(row.probeFixed, row.source);
          continue;
        }
        assert.equal(row.probe.status, 1);
        let expectedFix = row.source;
        let expectedProbe = row.source;
        for (const diagnostic of row.probe.output.diagnostics) {
          assert.equal(diagnostic.code, 'probe(boundary)');
          const observed: Observation = JSON.parse(diagnostic.message.slice('HEADSTAMP_PROBE:'.length));
          assert.equal(observed.text, observed.getText);
          assert.notEqual(observed.text, row.source);
          assert.equal(observed.filename, observed.physicalFilename);
          assert.ok(observed.physicalFilename.endsWith(`component.${format}`));
          assert.deepEqual(observed.range, [0, observed.text.length]);
          assert.deepEqual(observed.comments, []);
          const span = diagnostic.labels[0].span;
          assert.ok(span.offset > 0);
          assert.equal(
            Buffer.from(row.source)
              .subarray(span.offset, span.offset + span.length)
              .toString(),
            observed.text,
          );
          expectedFix = expectedFix.replace(observed.text, '/* Acme */\n\n' + observed.text);
          expectedProbe = expectedProbe.replace(observed.text, '/* PROBE */\n' + observed.text);
        }
        for (const diagnostic of row.before.output.diagnostics) {
          assert.equal(diagnostic.message, 'Missing required header.');
          assert.equal(diagnostic.code, 'headstamp(header)');
        }
        assert.equal(row.after, expectedFix);
        assert.equal(row.probeFixed, expectedProbe);
        assert.equal(row.after.match(/\/\* Acme \*\//g)?.length, expectedRegions);
        assert.equal(row.after.startsWith('/* Acme */'), false);
        if (row.header === 'existing') assert.ok(row.after.startsWith('<!-- Acme -->\n'));
        if (row.header === 'unrelated') assert.ok(row.after.startsWith('<!-- User documentation -->\n'));
      }
    });
  }
});
