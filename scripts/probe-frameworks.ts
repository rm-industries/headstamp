import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'node_modules/oxlint/bin/oxlint');
const directory = mkdtempSync(join(root, '.headstamp-test-'));
const bodies = {
  vue: {
    none: '<template><p>Physical 🌍</p></template>\n',
    one: '<template><p>Physical 🌍</p></template>\n<script>const instance = 1;</script>\n',
    multiple:
      '<template><p>Physical 🌍</p></template>\n<script>export const normal = 1;</script>\n<script setup>const setup = 2;</script>\n',
  },
  svelte: {
    none: '<p>Physical 🌍</p>\n',
    one: '<p>Physical 🌍</p>\n<script>const instance = 1;</script>\n',
    multiple:
      '<script context="module">export const shared = 1;</script>\n<p>Physical 🌍</p>\n<script>const instance = 2;</script>\n',
  },
  astro: {
    none: '<p>Physical 🌍</p>\n',
    one: '<p>Physical 🌍</p>\n<script>const client = 1;</script>\n',
    multiple: '<p>Physical 🌍</p>\n<script>const first = 2;</script>\n<script>const second = 3;</script>\n',
    frontmatter:
      '---\nconst frontmatter = 1;\n---\n<p>Physical 🌍</p>\n<script>const first = 2;</script>\n<script>const second = 3;</script>\n',
  },
};
const headers = { missing: '', existing: '<!-- Acme -->\n', unrelated: '<!-- User documentation -->\n' };
const lint = (name: string, fix = false) => {
  const result = spawnSync(
    process.execPath,
    [cli, '--format', 'json', '--threads', '1', ...(fix ? ['--fix'] : []), name],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) throw new Error(result.stdout + result.stderr);
  return { status: result.status, output: JSON.parse(result.stdout), stderr: result.stderr };
};
const configure = (probe: boolean, fix = false) =>
  writeFileSync(
    join(directory, '.oxlintrc.json'),
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [
        {
          name: probe ? 'probe' : 'headstamp',
          specifier: probe ? join(root, 'test/fixtures/framework-probe.ts') : '@rm-industries/oxlint-plugin-headstamp',
        },
      ],
      rules: probe
        ? { 'probe/boundary': ['error', fix] }
        : { 'headstamp/header': ['error', { template: '/* Acme */' }] },
    }),
  );
const results = [];
try {
  // The ordinary control proves the plugin was loaded, independent of framework discovery.
  configure(true);
  writeFileSync(join(directory, 'control.js'), 'export const control = 1;\n');
  const control = lint('control.js');
  for (const [format, variants] of Object.entries(bodies)) {
    for (const [scripts, body] of Object.entries(variants)) {
      for (const [header, prefix] of Object.entries(headers)) {
        // Astro frontmatter must precede HTML comments; probe it without a prefix.
        if (scripts === 'frontmatter' && header !== 'missing') continue;
        const name = `component.${format}`;
        const source = prefix + body;
        const path = join(directory, name);
        writeFileSync(path, source);
        configure(true);
        const probe = lint(name);
        configure(true, true);
        const editProbe = lint(name, true);
        const probeFixed = readFileSync(path, 'utf8');
        writeFileSync(path, source);
        configure(false);
        const before = lint(name);
        const fixed = lint(name, true);
        const after = readFileSync(path, 'utf8');
        const repeated = lint(name, true);
        results.push({
          format,
          scripts,
          header,
          source,
          probe,
          editProbe,
          probeFixed,
          before,
          fixed,
          after,
          repeated,
          converged: after === readFileSync(path, 'utf8'),
        });
      }
    }
  }
  const version = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
  if (version.status !== 0) throw new Error('Could not determine oxlint version.');
  console.log(
    JSON.stringify(
      { oxlint: version.stdout.trim(), node: process.version, platform: platform(), arch: arch(), control, results },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
