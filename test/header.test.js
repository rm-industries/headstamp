import { describe, it } from "node:test";
import { RuleTester } from "oxlint/plugins-dev";
import plugin from "../dist/index.js";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();
tester.run("header", plugin.rules.header, {
  valid: [
    { code: "/* Acme */\n\nexport {};\n", options: [{ template: "/* Acme */" }] },
    { code: "// Acme\n// Notice\n\nexport {};\n", options: [{ template: "// Acme\n// Notice\n" }] },
    { code: "/* Acme */\n", options: [{ template: "/* Acme */" }] },
    {
      code: "#!/usr/bin/env node\r\n/* Acme */\r\n\r\nexport {};\r\n",
      options: [{ template: "/* Acme */" }],
    },
  ],
  invalid: [
    {
      name: "preserves indentation when inserting a missing header",
      code: "  export {};\n",
      options: [{ template: "/* Acme */" }],
      errors: [{ messageId: "missing" }],
      output: "/* Acme */\n\n  export {};\n",
    },
    {
      name: "preserves multiline leading indentation on insertion",
      code: "\n\n\t export {};\n",
      options: [{ template: "/* Acme */" }],
      errors: [{ messageId: "missing" }],
      output: "/* Acme */\n\n\t export {};\n",
    },
    {
      name: "refuses extra consecutive line comments",
      code: "// Acme\n// User documentation\nexport {};\n",
      options: [{ template: "// Acme" }],
      errors: [{ messageId: "mismatch" }],
      output: null,
    },
    {
      name: "inserts a missing block header",
      code: "export {};\n",
      options: [{ template: "/* Acme */" }],
      errors: [{ messageId: "missing" }],
      output: "/* Acme */\n\nexport {};\n",
    },
    {
      name: "preserves an unrelated opening comment",
      code: "/** User documentation */\nexport {};\n",
      options: [{ template: "/* Acme */" }],
      errors: [{ messageId: "mismatch" }],
      output: null,
    },
    {
      name: "does not accept a partial line comment match",
      code: "// Acme extra\n\nexport {};\n",
      options: [{ template: "// Acme" }],
      errors: [{ messageId: "mismatch" }],
      output: null,
    },
    {
      name: "does not accept a partial block comment match",
      code: "/* Acme extra */\n\nexport {};\n",
      options: [{ template: "/* Acme */" }],
      errors: [{ messageId: "mismatch" }],
      output: null,
    },
    ...[
      [
        "inserts a line header",
        "export {};\n",
        "// Acme\n// Notice",
        "// Acme\n// Notice\n\nexport {};\n",
        "missing",
      ],
      [
        "preserves a shebang",
        "#!/usr/bin/env node\nexport {};\n",
        "/* Acme */",
        "#!/usr/bin/env node\n/* Acme */\n\nexport {};\n",
        "missing",
      ],
      [
        "preserves a BOM",
        "\uFEFFexport {};\n",
        "/* Acme */",
        "\uFEFF/* Acme */\n\nexport {};\n",
        "missing",
      ],
      [
        "terminates a shebang without newline",
        "#!/usr/bin/env node",
        "/* Acme */",
        "#!/usr/bin/env node\n/* Acme */\n",
        "missing",
      ],
      [
        "uses source CRLF",
        "export {};\r\n",
        "/*\n * Acme\n */\n",
        "/*\r\n * Acme\r\n */\r\n\r\nexport {};\r\n",
        "missing",
      ],
      ["inserts into an empty file", "", "/* Acme */", "/* Acme */\n", "missing"],
      [
        "replaces leading whitespace on insertion",
        " \n\nexport {};",
        "/* Acme */",
        "/* Acme */\n\nexport {};",
        "missing",
      ],
      ["normalizes whitespace-only files", " \r\n  ", "/* Acme */", "/* Acme */\r\n", "missing"],
      [
        "adds missing blank line",
        "/* Acme */\nexport {};",
        "/* Acme */",
        "/* Acme */\n\nexport {};",
        "spacing",
      ],
      [
        "removes excess blank lines",
        "/* Acme */\n\n\nexport {};",
        "/* Acme */",
        "/* Acme */\n\nexport {};",
        "spacing",
      ],
      [
        "preserves source indentation",
        "/* Acme */\n  export {};",
        "/* Acme */",
        "/* Acme */\n\n  export {};",
        "spacing",
      ],
      ["normalizes a header-only file", "/* Acme */\n\n", "/* Acme */", "/* Acme */\n", "spacing"],
      [
        "adds final newline to a header-only file",
        "/* Acme */",
        "/* Acme */",
        "/* Acme */\n",
        "spacing",
      ],
      [
        "retains adjacent source code",
        "/* Acme */export {};",
        "/* Acme */",
        "/* Acme */\n\nexport {};",
        "spacing",
      ],
      [
        "retains a separate following comment",
        "/* Acme */\n// documentation\nexport {};",
        "/* Acme */",
        "/* Acme */\n\n// documentation\nexport {};",
        "spacing",
      ],
      [
        "normalizes leading whitespace before header",
        "\n/* Acme */\n\nexport {};",
        "/* Acme */",
        "/* Acme */\n\nexport {};",
        "spacing",
      ],
      [
        "preserves Unicode source after header",
        "/* © Acme 🚀 */\nexport const café = '🚀';",
        "/* © Acme 🚀 */",
        "/* © Acme 🚀 */\n\nexport const café = '🚀';",
        "spacing",
      ],
    ].map(([name, code, template, output, messageId]) => ({
      name,
      code,
      options: [{ template }],
      output,
      errors: [{ messageId }],
    })),
  ],
});
