export function toPascalCase(snakeCase: string): string {
  return snakeCase
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export function singularize(name: string): string {
  if (name.endsWith('ies')) return name.slice(0, -3) + 'y';
  // Greek -ysis nouns: analyses -> analysis (dropping "es" would leave "analys").
  if (name.endsWith('yses')) return name.slice(0, -2) + 'is';
  if (name.endsWith('ses') || name.endsWith('xes') || name.endsWith('zes')) return name.slice(0, -2);
  if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1);
  return name;
}

const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$\u200C\u200D]*$/u;

/** Whether `name` can be written as it is where TypeScript expects an identifier. */
export function isIdentifier(name: string): boolean {
  return IDENTIFIER.test(name);
}

/**
 * Model class for `tableName`. `overrides` (the datasource's `model_classes`) names
 * the class of a table whose plural no suffix rule can tell apart, e.g.
 * `invitation_code_uses` (use) beside `campaign_statuses` (status).
 *
 * The class is an identifier in the generated model and a part of its file name, so a table whose
 * class would not be one (a quoted name with a space, a `-` or a `/`) is an error: it is named in
 * `model_classes` instead.
 */
export function tableNameToModelClass(tableName: string, overrides: Record<string, string> = {}): string {
  const modelClass = overrides[tableName] ?? toPascalCase(singularize(tableName));
  if (!isIdentifier(modelClass)) {
    throw new Error(
      `The model class ${JSON.stringify(modelClass)} of the table ${JSON.stringify(tableName)} is not a TypeScript identifier. ` +
        'Name its class in the datasource\'s model_classes.',
    );
  }
  return modelClass;
}
