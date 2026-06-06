/**
 * Type definitions aligned with agent-contracts-analyzer external insight API.
 * Defined locally to avoid a runtime dependency on agent-contracts-analyzer.
 */

import { z } from 'zod';

export type PropagationDirection = 'forward' | 'backward' | 'both';

export interface SymbolAnchor {
  symbolId: string;
  filePath: string;
  startLine: number;
  endLine: number;
}

export interface ExternalEvidence {
  kind: string;
  detail: string;
  filePath?: string;
  line?: number;
  endLine?: number;
  symbolId?: string;
  llmConfidence?: number;
}

export interface ExternalEdge {
  from: string;
  to: string;
  kind: string;
  propagation: PropagationDirection;
  weight?: number;
  metadata?: Record<string, unknown>;
  evidence?: ExternalEvidence[];
}

export interface AnchorMapping {
  domainId: string;
  filePaths: string[];
  symbolIds?: string[];
  symbols?: SymbolAnchor[];
  artifactId?: string;
}

export interface ExternalInsight {
  source: string;
  sourceVersion?: string;
  generatedAt?: string;
  edges: ExternalEdge[];
  anchorMapping?: AnchorMapping[];
}

export interface InsightQuery {
  projectRoot: string;
  changedFiles?: string[];
  changedSymbols?: string[];
  artifactIds?: string[];
  evidencePolicy?: {
    exclude?: string[];
  };
}

export interface InsightProvider {
  readonly name: string;
  provide(query: InsightQuery): Promise<ExternalInsight>;
}

export const ExternalEvidenceSchema = z.object({
  kind: z.string(),
  detail: z.string(),
  filePath: z.string().optional(),
  line: z.number().optional(),
  endLine: z.number().optional(),
  symbolId: z.string().optional(),
});

export const ExternalEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.string(),
  propagation: z.enum(['forward', 'backward', 'both']),
  weight: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  evidence: z.array(ExternalEvidenceSchema).optional(),
});

export const AnchorMappingSchema = z.object({
  domainId: z.string(),
  filePaths: z.array(z.string()),
  symbolIds: z.array(z.string()).optional(),
  artifactId: z.string().optional(),
});

export const ExternalInsightSchema = z.object({
  source: z.string(),
  sourceVersion: z.string().optional(),
  generatedAt: z.string().optional(),
  edges: z.array(ExternalEdgeSchema),
  anchorMapping: z.array(AnchorMappingSchema).optional(),
});
