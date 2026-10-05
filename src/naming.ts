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

/**
 * Model class for `tableName`. `overrides` (the datasource's `model_classes`) names
 * the class of a table whose plural no suffix rule can tell apart, e.g.
 * `invitation_code_uses` (use) beside `campaign_statuses` (status).
 */
export function tableNameToModelClass(tableName: string, overrides: Record<string, string> = {}): string {
  return overrides[tableName] ?? toPascalCase(singularize(tableName));
}
