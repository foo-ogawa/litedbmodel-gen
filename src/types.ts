export type DatabaseDialect = 'PostgreSQL' | 'MySQL' | 'SQLite';

export interface TableDef {
  name: string;
  columns: ColumnDef[];
}

export interface ColumnDef {
  name: string;
  sqlType: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  isArray: boolean;
}

export interface ColumnMapping {
  decorator: string;
  tsType: string;
}
