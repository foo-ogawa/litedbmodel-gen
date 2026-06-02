#!/usr/bin/env node
import { build } from "esbuild";
import { readFileSync, statSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const minify = process.argv.includes("--minify");

const externalPackages = [
  // LLM SDKs
  "@anthropic-ai/claude-agent-sdk",
  "@anthropic-ai/sdk",
  "@cursor/sdk",
  "@openai/agents",
  "@google/genai",
  // Native modules
  "better-sqlite3",
  // Peer dependencies
  "embedoc",
];

const resolveRuntimeDynamicImports = {
  name: "resolve-runtime-dynamic-imports",
  setup(build) {
    build.onLoad({ filter: /agents[\\/]orchestrator\.ts$/ }, async (args) => {
      let contents = readFileSync(args.path, "utf8");
      // litedbmodel-gen uses: const PKG = "agent-contracts-runtime"
      // followed by: await import(PKG) and template literal adapter imports
      // Replace dynamic imports with literal strings
      contents = contents.replace(
        /await import\(PKG\)/g,
        'await import("agent-contracts-runtime")',
      );
      contents = contents.replace(
        /await import\(`\$\{PKG\}\/adapters\/([^`]+)`\)/g,
        'await import("agent-contracts-runtime/adapters/$1")',
      );
      return { contents, loader: "ts" };
    });
  },
};

const inlineBuildTimeConstants = {
  name: "inline-build-time-constants",
  setup(build) {
    build.onLoad({ filter: /src[\\/]cli\.ts$/ }, async (args) => {
      let contents = readFileSync(args.path, "utf8");
      // Strip shebang if present
      contents = contents.replace(/^#!.*\n/, "");
      // Replace runtime package.json read
      contents = contents.replace(
        /const require = createRequire\(import\.meta\.url\);\nconst pkg = require\(['"]\.\.\/package\.json['"]\).*;\n/,
        `const pkg = { version: ${JSON.stringify(pkg.version)} };\n`,
      );
      return { contents, loader: "ts" };
    });
  },
};

const result = await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  outfile: "dist/litedbmodel-gen.bundle.mjs",
  minify,
  sourcemap: true,
  external: externalPackages,
  mainFields: ["module", "main"],
  conditions: ["import", "node"],
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire } from 'module';",
      "const require = createRequire(import.meta.url);",
    ].join("\n"),
  },
  plugins: [resolveRuntimeDynamicImports, inlineBuildTimeConstants],
  logLevel: "info",
});

if (result.errors.length > 0) process.exit(1);
const stat = statSync("dist/litedbmodel-gen.bundle.mjs");
const sizeKB = (stat.size / 1024).toFixed(1);
const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
console.log(`\n✓ dist/litedbmodel-gen.bundle.mjs  ${sizeKB} KB (${sizeMB} MB)`);
