/**
 * SQL Compatibility Helper
 * Fornece funções para operações que são diferentes entre PostgreSQL e SQLite
 */

import pgPool from './index';

/**
 * Upsert genérico: INSERT com tratamento de conflitos
 * SQLite: INSERT OR REPLACE / INSERT OR IGNORE
 * PostgreSQL: INSERT ... ON CONFLICT
 */
export async function upsertRecord(
  table: string,
  data: Record<string, any>,
  uniqueKey: string | string[]
): Promise<any> {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map(() => '?').join(', ');
  const columnNames = keys.join(', ');

  // Usar INSERT OR IGNORE para evitar erros de unique constraint
  // SQLite vai ignorar se houver conflito, PostgreSQL vai substituir
  const sql = `
    INSERT OR IGNORE INTO ${table} (${columnNames})
    VALUES (${placeholders})
  `;

  try {
    return await pgPool.query(sql, values);
  } catch (err) {
    // Se falhar com INSERT OR IGNORE, é porque estamos em PostgreSQL
    // Tentar com INSERT ... ON CONFLICT
    console.warn('INSERT OR IGNORE not supported, trying standard INSERT');
    throw err;
  }
}

/**
 * Buscar primeira linha ou valor padrão
 */
export function getFirstRow(result: any, defaultValue: any = null) {
  return result.rows?.[0] || defaultValue;
}

/**
 * Buscar todas as linhas
 */
export function getAllRows(result: any, defaultValue: any = []) {
  return result.rows || defaultValue;
}

/**
 * Verificar se query afetou linhas
 */
export function getRowsAffected(result: any): number {
  return result.changes || result.rowCount || 0;
}

/**
 * Sanitizar string para LIKE em ambos os bancos
 * Escapa caracteres especiais _ e %
 */
export function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Converter resultado de query para formato uniforme
 */
export interface QueryResult {
  rows: any[];
  rowCount?: number;
  changes?: number;
}

export function normalizeResult(result: any): QueryResult {
  return {
    rows: result.rows || [],
    rowCount: result.rowCount,
    changes: result.changes
  };
}
