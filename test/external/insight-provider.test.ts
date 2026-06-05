import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { ExternalInsightSchema } from '../../src/external/analyzer-types.js';
import {
  buildExternalInsight,
  createLitedbmodelGenInsightProvider,
  INSIGHT_PROVIDER_NAME,
} from '../../src/external/insight-provider.js';

const EXAMPLES_ROOT = resolve(import.meta.dirname, '../../example');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function createTempProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ldbmgen-insight-'));
  tempDirs.push(dir);

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(dir, relPath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content);
  }

  return dir;
}

describe('LitedbmodelGenInsightProvider', () => {
  it('implements InsightProvider and validates against ExternalInsightSchema', async () => {
    const provider = createLitedbmodelGenInsightProvider();
    expect(provider.name).toBe(INSIGHT_PROVIDER_NAME);

    const insight = await provider.provide({ projectRoot: EXAMPLES_ROOT });
    const parsed = ExternalInsightSchema.safeParse(insight);
    expect(parsed.success).toBe(true);
    expect(insight.source).toBe(INSIGHT_PROVIDER_NAME);
    expect(insight.sourceVersion).toBeDefined();
    expect(insight.edges.length).toBeGreaterThan(0);
    expect(insight.anchorMapping?.length).toBeGreaterThan(0);
  });

  it('maps schema SQL file to each generated model file', () => {
    const insight = buildExternalInsight(EXAMPLES_ROOT);
    const schemaPath = 'db/schema.sql';

    const userEdge = insight.edges.find(
      e => e.from === schemaPath && e.to === 'models/User.ts',
    );
    expect(userEdge).toBeDefined();
    expect(userEdge).toMatchObject({
      kind: 'generates',
      propagation: 'forward',
      weight: 0.9,
    });
    expect(userEdge!.evidence?.[0]).toMatchObject({
      kind: 'sql_ddl_table',
      detail: 'CREATE TABLE users → User',
      filePath: schemaPath,
    });

    const postEdge = insight.edges.find(
      e => e.from === schemaPath && e.to === 'models/Post.ts',
    );
    expect(postEdge).toBeDefined();

    const postTagEdge = insight.edges.find(
      e => e.from === schemaPath && e.to === 'models/PostTag.ts',
    );
    expect(postTagEdge).toBeDefined();

    const tagEdge = insight.edges.find(
      e => e.from === schemaPath && e.to === 'models/Tag.ts',
    );
    expect(tagEdge).toBeDefined();

    expect(insight.edges.filter(e => e.from === schemaPath)).toHaveLength(4);
  });

  it('resolves anchor mappings for schema and model domain IDs', () => {
    const insight = buildExternalInsight(EXAMPLES_ROOT);

    const schemaAnchor = insight.anchorMapping?.find(a => a.domainId === 'db/schema.sql');
    expect(schemaAnchor).toBeDefined();
    expect(schemaAnchor!.filePaths).toContain('db/schema.sql');

    const userAnchor = insight.anchorMapping?.find(a => a.domainId === 'models/User.ts');
    expect(userAnchor).toBeDefined();
    expect(userAnchor!.filePaths).toContain('models/User.ts');
    expect(userAnchor!.symbolIds).toContain('models/User.ts#User');
    expect(userAnchor!.symbols?.[0]?.symbolId).toBe('models/User.ts#User');
  });
});

describe('buildExternalInsight error handling', () => {
  it('throws when embedoc.config.yaml is missing', () => {
    const dir = createTempProject({});
    expect(() => buildExternalInsight(dir)).toThrow(/embedoc\.config\.yaml not found/i);
  });

  it('throws when SQL schema file is unreadable', () => {
    const dir = createTempProject({
      'embedoc.config.yaml': `
datasources:
  schema:
    type: sql_schema
    path: "./db/missing.sql"
    database: PostgreSQL
    generators:
      - output_path: "./models/{model_class}.ts"
`,
    });

    expect(() => buildExternalInsight(dir)).toThrow(/SQL schema file not readable/i);
  });
});
