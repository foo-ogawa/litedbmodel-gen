import { describe, it, expect } from 'vitest';
import { runAgentTask } from '../src/agents/orchestrator';

describe('runAgentTask', () => {
  it('reports an output the result schema rejects as validation_error, with the schema errors', async () => {
    const result = await runAgentTask(
      'audit request',
      'audit-litedbmodel-usage',
      { adapter: 'mock', mockResponses: { 'audit-litedbmodel-usage': () => '{"summary": 1}' } },
      {},
    );

    expect(result.status).toBe('validation_error');
    expect(result.data).toBeNull();
    expect(result.raw).toBe('{"summary": 1}');
    expect(result.errorMessage).toMatch(/^summary: /);
    expect(result.errorMessage).toMatch(/riskLevel: /);
  });

  it('reports a conforming output as success', async () => {
    const data = { summary: 'ok', riskLevel: 'low', findings: [] };
    const result = await runAgentTask(
      'audit request',
      'audit-litedbmodel-usage',
      { adapter: 'mock', mockResponses: { 'audit-litedbmodel-usage': () => JSON.stringify(data) } },
      {},
    );

    expect(result.status).toBe('success');
    expect(result.data).toMatchObject(data);
  });
});
