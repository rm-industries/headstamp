import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = join(root, "node_modules/oxlint/bin/oxlint");

test("TypeScript config, external templates, overrides and ignores work through the CLI", (t) => {
  const directory = mkdtempSync(join(root, ".headstamp-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (name, content) => writeFileSync(join(directory, name), content);
  const read = (name) => readFileSync(join(directory, name), "utf8");
  const lint = (...args) =>
    spawnSync(process.execPath, [cli, "--threads", "1", ...args, "."], {
      cwd: directory,
      encoding: "utf8",
      timeout: 30000,
    });
  write("HEADER.txt", "/* Acme */\n");
  write(
    "oxlint.config.ts",
    `
import { defineConfig } from "oxlint";
import { readFileSync } from "node:fs";
import type { HeaderOptions } from "@rm-industries/oxlint-plugin-headstamp";
const header = { template: readFileSync(new URL("./HEADER.txt", import.meta.url), "utf8") } satisfies HeaderOptions;
export default defineConfig({
  categories: { correctness: "off" },
  jsPlugins: [{ name: "headstamp", specifier: "@rm-industries/oxlint-plugin-headstamp" }],
  ignorePatterns: ["oxlint.config.ts", "ignored.js"],
  rules: { "headstamp/header": ["error", header] },
  overrides: [
    { files: ["disabled.js"], rules: { "headstamp/header": "off" } },
    { files: ["inline.ts"], rules: { "headstamp/header": ["error", { template: "// Inline" }] } }
  ]
});

`,
  );
  const inputs = {
    "source.js": "export {};\n",
    "types.ts": "export const value: number = 1;\n",
    "view.jsx": "export const view = <div />;\n",
    "view.tsx": "export const view = <div />;\n",
    "inline.ts": "export {};\n",
    "bom.js": "\uFEFFexport {};\r\n",
    "shebang.js": "#!/usr/bin/env node\nexport {};\n",
    "ignored.js": "export {};\n",
    "disabled.js": "export {};\n",
  };
  for (const [name, content] of Object.entries(inputs)) write(name, content);
  const before = lint();
  assert.equal(before.status, 1, before.stdout + before.stderr);
  assert.match(before.stdout + before.stderr, /Missing required header/);
  const fixed = lint("--fix");
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.equal(read("source.js"), "/* Acme */\n\nexport {};\n");
  assert.equal(read("inline.ts"), "// Inline\n\nexport {};\n");
  assert.equal(read("bom.js"), "\uFEFF/* Acme */\r\n\r\nexport {};\r\n");
  assert.equal(read("shebang.js"), "#!/usr/bin/env node\n/* Acme */\n\nexport {};\n");
  for (const name of ["types.ts", "view.jsx", "view.tsx"]) {
    assert.equal(read(name), "/* Acme */\n\n" + inputs[name]);
  }
  assert.equal(read("ignored.js"), inputs["ignored.js"]);
  assert.equal(read("disabled.js"), inputs["disabled.js"]);
  const after = Object.fromEntries(Object.keys(inputs).map((name) => [name, read(name)]));
  const repeated = lint("--fix");
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
  for (const [name, content] of Object.entries(after)) assert.equal(read(name), content);
  write("conflict.js", "/** User documentation */\nexport {};\n");
  const conflict = lint("--fix");
  assert.equal(conflict.status, 1, conflict.stdout + conflict.stderr);
  assert.equal(read("conflict.js"), "/** User documentation */\nexport {};\n");
  write(
    "contract.ts",
    `
import type { HeaderOptions } from "@rm-industries/oxlint-plugin-headstamp";
const valid: HeaderOptions = { template: "/* Acme */" };
// @ts-expect-error A template is required.
const missing: HeaderOptions = {};
// @ts-expect-error A template must be a string.
const invalid: HeaderOptions = { template: 42 };
`,
  );
  const types = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "--ignoreConfig",
      "--types",
      "node",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--module",
      "nodenext",
      "--target",
      "es2022",
      "oxlint.config.ts",
      "contract.ts",
    ],
    { cwd: directory, encoding: "utf8", timeout: 30000 },
  );
  assert.equal(types.status, 0, types.stdout + types.stderr);
});

test("invalid literal template configuration fails without modifying source", (t) => {
  const directory = mkdtempSync(join(root, ".headstamp-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, "source.js");
  writeFileSync(source, "export {};\n");
  for (const options of [
    {},
    { template: 42 },
    { template: "" },
    { template: "Copyright Acme" },
    { template: "/* unclosed" },
    { template: "/*/" },
    { template: "/* Acme */\nexport {};" },
    { template: "/* Acme */ /* other */" },
    { template: "// Acme\nnot a comment" },
    { template: "// Acme\r// other" },
    { template: "// Acme\u2028export {};" },
    { template: "/* Acme */", unexpected: true },
  ]) {
    writeFileSync(
      join(directory, ".oxlintrc.json"),
      JSON.stringify({
        categories: { correctness: "off" },
        jsPlugins: [{ name: "headstamp", specifier: "@rm-industries/oxlint-plugin-headstamp" }],
        rules: { "headstamp/header": ["error", options] },
      }),
    );
    const result = spawnSync(process.execPath, [cli, "--fix", "source.js"], {
      cwd: directory,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.notEqual(result.status, 0, JSON.stringify(options));
    assert.match(result.stdout + result.stderr, /Headstamp|headstamp|template/);
    assert.equal(readFileSync(source, "utf8"), "export {};\n");
  }
});
