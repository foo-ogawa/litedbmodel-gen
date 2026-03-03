import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const TMP_DIR = join(import.meta.dirname!, '__tmp_cli_test__');
const CLI_PATH = join(import.meta.dirname!, '..', 'dist', 'cli.js');

function setupProject() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });

  // Simulate embedoc init output
  writeFileSync(join(TMP_DIR, 'embedoc.config.yaml'), `version: "1.0"

targets:
  - pattern: "./docs/**/*.md"
    comment_style: html
    exclude:
      - "**/node_modules/**"

datasources: {}
  # example_db:
  #   type: sqlite
  #   path: "./data/example.db"
`);

  mkdirSync(join(TMP_DIR, '.embedoc', 'renderers'), { recursive: true });
  writeFileSync(join(TMP_DIR, '.embedoc', 'renderers', 'index.ts'), `/**
 * embedoc renderers
 */

// import myRenderer from './my_renderer.ts';

export const embeds = {
  // my_renderer: myRenderer,
};
`);

  mkdirSync(join(TMP_DIR, '.embedoc', 'datasources'), { recursive: true });
  writeFileSync(join(TMP_DIR, '.embedoc', 'datasources', 'index.ts'), `/**
 * embedoc custom datasources and inline format parsers
 */

// import myDatasource from './my_datasource.ts';

export const datasourceTypes = {
  // my_datasource: myDatasource,
};

export const inlineFormats = {
  // toml: (content: string) => parseToml(content),
};
`);

  mkdirSync(join(TMP_DIR, '.embedoc', 'templates'), { recursive: true });
}

function runInit() {
  return execSync(`node ${CLI_PATH} init embedoc.config.yaml`, {
    cwd: TMP_DIR,
    encoding: 'utf-8',
  });
}

describe('litedbmodel-gen init', () => {
  beforeEach(() => setupProject());
  afterAll(() => rmSync(TMP_DIR, { recursive: true, force: true }));

  it('copies model.hbs template', () => {
    runInit();
    const dest = join(TMP_DIR, '.embedoc', 'templates', 'model.hbs');
    expect(existsSync(dest)).toBe(true);
    const content = readFileSync(dest, 'utf-8');
    expect(content).toContain('@model');
    expect(content).toContain('litedbmodel_columns');
  });

  it('updates renderers/index.ts with import and entry', () => {
    runInit();
    const content = readFileSync(join(TMP_DIR, '.embedoc', 'renderers', 'index.ts'), 'utf-8');
    expect(content).toContain("import { litedbmodelColumns } from 'litedbmodel-gen'");
    expect(content).toContain('litedbmodel_columns:');
    expect(content).toContain('...litedbmodelColumns');
    expect(content).toContain("dependsOn: ['schema']");
  });

  it('updates datasources/index.ts with import and entry', () => {
    runInit();
    const content = readFileSync(join(TMP_DIR, '.embedoc', 'datasources', 'index.ts'), 'utf-8');
    expect(content).toContain("import { sqlSchema } from 'litedbmodel-gen'");
    expect(content).toContain('sql_schema: sqlSchema');
  });

  it('updates embedoc.config.yaml with schema datasource', () => {
    runInit();
    const content = readFileSync(join(TMP_DIR, 'embedoc.config.yaml'), 'utf-8');
    expect(content).toContain('type: sql_schema');
    expect(content).toContain('path: "./db/schema.sql"');
    expect(content).toContain('database: PostgreSQL');
    expect(content).toContain('template: model.hbs');
    // Should have added models target
    expect(content).toContain('models/**/*.ts');
    expect(content).toContain('comment_style: block');
  });

  it('is idempotent — running twice does not duplicate entries', () => {
    runInit();
    runInit();

    const renderers = readFileSync(join(TMP_DIR, '.embedoc', 'renderers', 'index.ts'), 'utf-8');
    const importCount = (renderers.match(/from 'litedbmodel-gen'/g) || []).length;
    expect(importCount).toBe(1);

    const datasources = readFileSync(join(TMP_DIR, '.embedoc', 'datasources', 'index.ts'), 'utf-8');
    const dsImportCount = (datasources.match(/from 'litedbmodel-gen'/g) || []).length;
    expect(dsImportCount).toBe(1);

    const config = readFileSync(join(TMP_DIR, 'embedoc.config.yaml'), 'utf-8');
    const sqlSchemaCount = (config.match(/sql_schema/g) || []).length;
    expect(sqlSchemaCount).toBe(1);
  });
});

describe('litedbmodel-gen init with custom dirs', () => {
  const CUSTOM_DIR = join(import.meta.dirname!, '__tmp_cli_custom_test__');

  beforeEach(() => {
    rmSync(CUSTOM_DIR, { recursive: true, force: true });
    mkdirSync(CUSTOM_DIR, { recursive: true });

    writeFileSync(join(CUSTOM_DIR, 'embedoc.config.yaml'), `version: "1.0"

renderers_dir: "custom/renderers"
datasources_dir: "custom/datasources"
templates_dir: "custom/templates"

targets:
  - pattern: "./docs/**/*.md"
    comment_style: html

datasources: {}
`);

    mkdirSync(join(CUSTOM_DIR, 'custom', 'renderers'), { recursive: true });
    writeFileSync(join(CUSTOM_DIR, 'custom', 'renderers', 'index.ts'), `export const embeds = {
};
`);

    mkdirSync(join(CUSTOM_DIR, 'custom', 'datasources'), { recursive: true });
    writeFileSync(join(CUSTOM_DIR, 'custom', 'datasources', 'index.ts'), `export const datasourceTypes = {
};

export const inlineFormats = {
};
`);

    mkdirSync(join(CUSTOM_DIR, 'custom', 'templates'), { recursive: true });
  });

  afterAll(() => rmSync(CUSTOM_DIR, { recursive: true, force: true }));

  it('reads dirs from config and writes to custom paths', () => {
    execSync(`node ${CLI_PATH} init embedoc.config.yaml`, {
      cwd: CUSTOM_DIR,
      encoding: 'utf-8',
    });

    // Template should be in custom/templates/
    expect(existsSync(join(CUSTOM_DIR, 'custom', 'templates', 'model.hbs'))).toBe(true);

    // Renderers should be in custom/renderers/
    const renderers = readFileSync(join(CUSTOM_DIR, 'custom', 'renderers', 'index.ts'), 'utf-8');
    expect(renderers).toContain("from 'litedbmodel-gen'");
    expect(renderers).toContain('litedbmodel_columns');

    // Datasources should be in custom/datasources/
    const datasources = readFileSync(join(CUSTOM_DIR, 'custom', 'datasources', 'index.ts'), 'utf-8');
    expect(datasources).toContain("from 'litedbmodel-gen'");
    expect(datasources).toContain('sql_schema');

    // .embedoc/ should NOT have been created
    expect(existsSync(join(CUSTOM_DIR, '.embedoc'))).toBe(false);
  });
});
