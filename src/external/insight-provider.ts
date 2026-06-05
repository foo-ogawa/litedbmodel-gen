import { readFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import yaml from 'js-yaml';
import { parseSchema } from '../parser.js';
import { tableNameToModelClass } from '../naming.js';
import type { DatabaseDialect } from '../types.js';
import type {
  AnchorMapping,
  ExternalEdge,
  ExternalEvidence,
  ExternalInsight,
  InsightProvider,
  InsightQuery,
} from './analyzer-types.js';

const require = createRequire(import.meta.url);

function getPackageVersion(): string {
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      return (require(rel) as { version: string }).version;
    } catch {
      // try next candidate
    }
  }
  return '0.0.0';
}

export const INSIGHT_PROVIDER_NAME = 'litedbmodel-gen';

const EDGE_KIND = 'generates';
const EDGE_WEIGHT = 0.9;
const EVIDENCE_KIND = 'sql_ddl_table';
const DEFAULT_CONFIG = 'embedoc.config.yaml';

export interface BuildExternalInsightOptions {
  configPath?: string;
}

interface GeneratorConfig {
  output_path?: string;
}

interface DatasourceConfig {
  type?: string;
  path?: string;
  database?: string;
  generators?: GeneratorConfig[];
}

interface EmbedocConfig {
  datasources?: Record<string, DatasourceConfig>;
}

function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function toRelativeProjectPath(projectRoot: string, absolutePath: string): string {
  return toPosixPath(relative(resolve(projectRoot), absolutePath));
}

function findConfigFile(projectRoot: string): string | null {
  const candidate = resolve(projectRoot, DEFAULT_CONFIG);
  return existsSync(candidate) ? candidate : null;
}

function loadEmbedocConfig(configPath: string): EmbedocConfig {
  const raw = readFileSync(configPath, 'utf-8');
  return (yaml.load(raw) ?? {}) as EmbedocConfig;
}

function modelSymbolId(modelRelPath: string, modelClass: string): string {
  return `${modelRelPath}#${modelClass}`;
}

function upsertAnchor(
  anchors: Map<string, AnchorMapping>,
  domainId: string,
  filePath: string,
  symbolId?: string,
): void {
  const existing = anchors.get(domainId);
  if (existing) {
    if (!existing.filePaths.includes(filePath)) {
      existing.filePaths.push(filePath);
    }
    if (symbolId && !existing.symbolIds?.includes(symbolId)) {
      existing.symbolIds = [...(existing.symbolIds ?? []), symbolId];
      existing.symbols = [
        ...(existing.symbols ?? []),
        {
          symbolId,
          filePath,
          startLine: 1,
          endLine: 1,
        },
      ];
    }
    return;
  }

  anchors.set(domainId, {
    domainId,
    filePaths: [filePath],
    ...(symbolId
      ? {
          symbolIds: [symbolId],
          symbols: [
            {
              symbolId,
              filePath,
              startLine: 1,
              endLine: 1,
            },
          ],
        }
      : {}),
  });
}

function resolveOutputPath(
  outputPattern: string,
  modelClass: string,
  configDir: string,
  projectRoot: string,
): string {
  const substituted = outputPattern.replace(/\{model_class\}/g, modelClass);
  const absolute = resolve(configDir, substituted);
  return toRelativeProjectPath(projectRoot, absolute);
}

function readSchemaSql(schemaAbsPath: string, schemaRelPath: string): string {
  try {
    return readFileSync(schemaAbsPath, 'utf-8');
  } catch {
    throw new Error(`SQL schema file not readable: ${schemaRelPath}`);
  }
}

function collectDatasourceInsights(
  datasource: DatasourceConfig,
  configDir: string,
  projectRoot: string,
  edges: ExternalEdge[],
  anchors: Map<string, AnchorMapping>,
): void {
  if (datasource.type !== 'sql_schema') return;

  const schemaPath = datasource.path;
  if (!schemaPath) return;

  const generators = datasource.generators?.filter(g => g.output_path) ?? [];
  if (generators.length === 0) return;

  const schemaAbs = resolve(configDir, schemaPath);
  const schemaRel = toRelativeProjectPath(projectRoot, schemaAbs);
  const sql = readSchemaSql(schemaAbs, schemaRel);
  const database = (datasource.database as DatabaseDialect | undefined) ?? 'PostgreSQL';
  const tables = parseSchema(sql, { database });

  upsertAnchor(anchors, schemaRel, schemaRel);

  for (const table of tables) {
    const modelClass = tableNameToModelClass(table.name);

    for (const generator of generators) {
      const outputPattern = generator.output_path!;
      const modelRel = resolveOutputPath(outputPattern, modelClass, configDir, projectRoot);
      const symbolId = modelSymbolId(modelRel, modelClass);

      const evidence: ExternalEvidence = {
        kind: EVIDENCE_KIND,
        detail: `CREATE TABLE ${table.name} → ${modelClass}`,
        filePath: schemaRel,
      };

      edges.push({
        from: schemaRel,
        to: modelRel,
        kind: EDGE_KIND,
        propagation: 'forward',
        weight: EDGE_WEIGHT,
        metadata: {
          tableName: table.name,
          modelClass,
          database,
        },
        evidence: [evidence],
      });

      upsertAnchor(anchors, modelRel, modelRel, symbolId);
    }
  }
}

export function buildExternalInsight(
  projectRoot: string,
  options: BuildExternalInsightOptions = {},
): ExternalInsight {
  const resolvedRoot = resolve(projectRoot);
  const configPath = options.configPath
    ? resolve(options.configPath)
    : findConfigFile(resolvedRoot);

  if (!configPath || !existsSync(configPath)) {
    throw new Error(
      `${DEFAULT_CONFIG} not found. Run from project root or pass --config.`,
    );
  }

  const config = loadEmbedocConfig(configPath);
  const configDir = dirname(configPath);
  const edges: ExternalEdge[] = [];
  const anchors = new Map<string, AnchorMapping>();

  for (const datasource of Object.values(config.datasources ?? {})) {
    collectDatasourceInsights(datasource, configDir, resolvedRoot, edges, anchors);
  }

  const anchorMapping = [...anchors.values()].sort((a, b) =>
    a.domainId.localeCompare(b.domainId),
  );

  return {
    source: INSIGHT_PROVIDER_NAME,
    sourceVersion: getPackageVersion(),
    generatedAt: new Date().toISOString(),
    edges: edges.sort((a, b) =>
      a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    ),
    anchorMapping: anchorMapping.length > 0 ? anchorMapping : undefined,
  };
}

export class LitedbmodelGenInsightProvider implements InsightProvider {
  readonly name = INSIGHT_PROVIDER_NAME;

  constructor(private readonly configPath?: string) {}

  async provide(query: InsightQuery): Promise<ExternalInsight> {
    return buildExternalInsight(query.projectRoot, {
      configPath: this.configPath,
    });
  }
}

export function createLitedbmodelGenInsightProvider(
  configPath?: string,
): LitedbmodelGenInsightProvider {
  return new LitedbmodelGenInsightProvider(configPath);
}
