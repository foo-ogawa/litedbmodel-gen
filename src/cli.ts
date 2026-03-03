import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface EmbedocDirs {
  renderersDir: string;
  datasourcesDir: string;
  templatesDir: string;
}

function resolveEmbedocDirs(configPath: string): EmbedocDirs {
  const configDir = dirname(configPath);
  const raw = readFileSync(configPath, 'utf-8');
  const config = (yaml.load(raw) ?? {}) as Record<string, unknown>;

  const renderersDir = resolve(
    configDir,
    (config['renderers_dir'] as string) ?? '.embedoc/renderers',
  );
  const datasourcesDir = resolve(
    configDir,
    (config['datasources_dir'] as string) ?? '.embedoc/datasources',
  );
  const templatesDir = resolve(
    configDir,
    (config['templates_dir'] as string) ?? '.embedoc/templates',
  );

  return { renderersDir, datasourcesDir, templatesDir };
}

const program = new Command();

program
  .name('litedbmodel-gen')
  .description('embedoc-based model code generator for litedbmodel')
  .version('0.1.0');

program
  .command('init')
  .description('Set up litedbmodel-gen in an embedoc project')
  .argument('[config]', 'path to embedoc.config.yaml', 'embedoc.config.yaml')
  .action((configPath: string) => {
    const absConfigPath = resolve(configPath);
    if (!existsSync(absConfigPath)) {
      console.error(`Error: ${configPath} not found. Run "npx embedoc init" first.`);
      process.exit(1);
    }

    const dirs = resolveEmbedocDirs(absConfigPath);

    console.log('Setting up litedbmodel-gen...\n');

    copyTemplate(dirs.templatesDir);
    updateRenderersIndex(dirs.renderersDir);
    updateDatasourcesIndex(dirs.datasourcesDir);
    updateConfig(absConfigPath);

    console.log('\nDone! Next steps:');
    console.log('  1. Edit embedoc.config.yaml — set path/database in the schema datasource');
    console.log('  2. npx embedoc generate --datasource schema  (create model files)');
    console.log('  3. npx embedoc build                         (fill in column definitions)');
  });

function copyTemplate(templatesDir: string): void {
  mkdirSync(templatesDir, { recursive: true });

  const destPath = join(templatesDir, 'model.hbs');
  if (existsSync(destPath)) {
    console.log(`  skip  ${destPath} (already exists)`);
    return;
  }

  const srcPath = resolvePackageTemplate();
  copyFileSync(srcPath, destPath);
  console.log(`  create  ${destPath}`);
}

function resolvePackageTemplate(): string {
  const candidates = [
    resolve(__dirname, '..', 'templates', 'model.hbs'),
    resolve(__dirname, 'templates', 'model.hbs'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error('Could not find model.hbs template in package');
}

function updateRenderersIndex(renderersDir: string): void {
  const filePath = join(renderersDir, 'index.ts');
  if (!existsSync(filePath)) {
    console.error(`  warn  ${filePath} not found, skipping renderers setup`);
    return;
  }

  let content = readFileSync(filePath, 'utf-8');
  if (content.includes('litedbmodel-gen')) {
    console.log(`  skip  ${filePath} (already configured)`);
    return;
  }

  const importLine = "import { litedbmodelColumns } from 'litedbmodel-gen';";

  const entry = `  litedbmodel_columns: {
    ...litedbmodelColumns,
    dependsOn: ['schema'],
  },`;

  if (content.includes('import ')) {
    const lastImportIdx = content.lastIndexOf('import ');
    const lineEnd = content.indexOf('\n', lastImportIdx);
    content = content.slice(0, lineEnd + 1) + importLine + '\n' + content.slice(lineEnd + 1);
  } else {
    content = importLine + '\n\n' + content;
  }

  content = insertIntoObject(content, 'embeds', entry);

  writeFileSync(filePath, content, 'utf-8');
  console.log(`  update  ${filePath}`);
}

function updateDatasourcesIndex(datasourcesDir: string): void {
  const filePath = join(datasourcesDir, 'index.ts');
  if (!existsSync(filePath)) {
    console.error(`  warn  ${filePath} not found, skipping datasources setup`);
    return;
  }

  let content = readFileSync(filePath, 'utf-8');
  if (content.includes('litedbmodel-gen')) {
    console.log(`  skip  ${filePath} (already configured)`);
    return;
  }

  const importLine = "import { sqlSchema } from 'litedbmodel-gen';";

  const entry = '  sql_schema: sqlSchema,';

  if (content.includes('import ')) {
    const lastImportIdx = content.lastIndexOf('import ');
    const lineEnd = content.indexOf('\n', lastImportIdx);
    content = content.slice(0, lineEnd + 1) + importLine + '\n' + content.slice(lineEnd + 1);
  } else {
    content = importLine + '\n\n' + content;
  }

  content = insertIntoObject(content, 'datasourceTypes', entry);

  writeFileSync(filePath, content, 'utf-8');
  console.log(`  update  ${filePath}`);
}

function insertIntoObject(source: string, objectName: string, entry: string): string {
  const pattern = new RegExp(`(export\\s+const\\s+${objectName}\\s*=\\s*\\{)([^}]*)(\\})`);
  const match = source.match(pattern);
  if (!match) return source;

  const [, opening, body, closing] = match;
  const trimmedBody = body.replace(/\s+/g, ' ').trim();

  let newBody: string;
  if (trimmedBody === '' || trimmedBody.startsWith('//')) {
    newBody = `\n${entry}\n`;
  } else {
    newBody = body.trimEnd() + '\n' + entry + '\n';
  }

  return source.replace(pattern, `${opening}${newBody}${closing}`);
}

function updateConfig(configPath: string): void {
  let content = readFileSync(configPath, 'utf-8');

  if (content.includes('sql_schema')) {
    console.log('  skip  embedoc.config.yaml (sql_schema already configured)');
    return;
  }

  const datasourceBlock = `  schema:
    type: sql_schema
    path: "./db/schema.sql"
    database: PostgreSQL
    generators:
      - output_path: "./models/{model_class}.ts"
        template: model.hbs
        overwrite: false`;

  if (content.includes('datasources: {}')) {
    content = content.replace('datasources: {}', 'datasources:\n' + datasourceBlock);
  } else if (content.includes('datasources:')) {
    const idx = content.indexOf('datasources:');
    const lineEnd = content.indexOf('\n', idx);
    content = content.slice(0, lineEnd + 1) + datasourceBlock + '\n' + content.slice(lineEnd + 1);
  } else {
    content += '\ndatasources:\n' + datasourceBlock + '\n';
  }

  if (!content.includes('models/**/*.ts')) {
    const targetsInsert = `  - pattern: "./models/**/*.ts"
    comment_style: block`;

    if (content.includes('targets:')) {
      const idx = content.indexOf('targets:');
      const lineEnd = content.indexOf('\n', idx);
      content = content.slice(0, lineEnd + 1) + targetsInsert + '\n' + content.slice(lineEnd + 1);
    }
  }

  writeFileSync(configPath, content, 'utf-8');
  console.log('  update  embedoc.config.yaml');
}

program.parse();
