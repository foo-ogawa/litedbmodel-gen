import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, type ExecSyncOptionsWithStringEncoding } from 'child_process';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TMP_DIR = join(tmpdir(), 'ldbmgen-implement-test');
const CLI_PATH = join(import.meta.dirname!, '..', 'dist', 'litedbmodel-gen.bundle.mjs');
const EXEC_OPTS: ExecSyncOptionsWithStringEncoding = {
  cwd: TMP_DIR,
  encoding: 'utf-8',
  env: { ...process.env, NO_COLOR: '1' },
};

function run(args: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, EXEC_OPTS);
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout ?? '') + (e.stderr ?? ''),
      exitCode: e.status ?? 1,
    };
  }
}

function setupProject() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });

  mkdirSync(join(TMP_DIR, 'models'), { recursive: true });
  writeFileSync(
    join(TMP_DIR, 'models', 'User.ts'),
    `import { DBModel, column } from 'litedbmodel';

export class User extends DBModel {
  static tableName = 'users';
  static columns = {
    id: column('id'),
    email: column('email'),
    name: column('name'),
    created_at: column('created_at'),
  };
}
`,
  );

  mkdirSync(join(TMP_DIR, 'src', 'services'), { recursive: true });
  writeFileSync(
    join(TMP_DIR, 'src', 'services', 'user.service.ts'),
    `import { User } from '../../models/User';

export class UserService {
  // existing methods
}
`,
  );
}

describe('litedbmodel-gen implement', () => {
  beforeAll(() => setupProject());
  afterAll(() => rmSync(TMP_DIR, { recursive: true, force: true }));

  // ── validation ─────────────────────────────────────────

  it('exits 3 when description is missing', () => {
    const result = run('implement ""');
    expect(result.exitCode).toBe(3);
    expect(result.stdout).toContain('missing_description');
  });

  // ── dry-run ────────────────────────────────────────────

  it('dry-run outputs prompt without calling LLM', () => {
    const result = run(
      'implement "Add findByEmail method" --dry-run',
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.prompt).toContain('Add findByEmail method');
    expect(parsed.prompt).toContain('models/**/*.ts');
  });

  it('dry-run prompt includes --target when specified', () => {
    const result = run(
      'implement "Add findByEmail" --target src/services/user.service.ts --dry-run',
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.prompt).toContain('src/services/user.service.ts');
    expect(parsed.prompt).toContain('Read the target file');
  });

  it('dry-run prompt does not include target path in parameters when --target is omitted', () => {
    const result = run(
      'implement "Add findByEmail" --dry-run',
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.prompt).not.toContain('**Target file**');
  });

  it('dry-run prompt includes custom --models glob', () => {
    const result = run(
      'implement "Add findByEmail" --models "src/db/**/*.model.ts" --dry-run',
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.prompt).toContain('src/db/**/*.model.ts');
  });

  // ── mock adapter execution ─────────────────────────────

  it('runs with mock adapter (default) and returns JSON result', () => {
    const result = run(
      'implement "Add bulk upsert for users" --target src/services/user.service.ts',
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('findings');
    expect(parsed).toHaveProperty('riskLevel');
  });

  it('mock adapter result contains metadata', () => {
    const result = run(
      'implement "Add bulk upsert" --target src/services/user.service.ts',
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.metadata).toBeDefined();
  });

  // ── output formats ─────────────────────────────────────

  it('text format outputs human-readable report', () => {
    const result = run(
      'implement "Add findByEmail" --target src/services/user.service.ts --report-format text',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Summary');
    expect(result.stdout).toContain('Risk level');
  });

  it('yaml format outputs valid YAML', () => {
    const result = run(
      'implement "Add findByEmail" --target src/services/user.service.ts --report-format yaml',
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('summary:');
    expect(result.stdout).toContain('riskLevel:');
  });

  // ── --schema is no longer accepted ─────────────────────

  it('rejects the removed --schema option', () => {
    const result = run(
      'implement "Add findByEmail" --schema db/schema.sql',
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("unknown option '--schema'");
  });
});
