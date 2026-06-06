import { defineConfig } from 'tsup';

const sdkExternals = [
  '@anthropic-ai/claude-agent-sdk',
  '@openai/agents',
  '@google/adk',
];

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['embedoc', ...sdkExternals],
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
    external: ['embedoc', ...sdkExternals],
  },
]);
