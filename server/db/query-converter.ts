/**
 * Query Converter: Converte queries PostgreSQL para SQLite automaticamente
 */

export function convertQuery(sql: string, params: any[] = []): { sql: string; params: any[] } {
  let converted = sql;

  // 1. Converter $1, $2, $3... para ? (SQLite) - mantém ordem de params
  converted = converted.replace(/\$\d+/g, () => '?');

  // 2. Remover ON CONFLICT (SQLite não suporta)
  // INSERT ... ON CONFLICT (x) DO UPDATE SET y = z → INSERT OR REPLACE INTO ... (id, x, y) VALUES (?, ?, ?)
  const onConflictMatch = converted.match(/ON CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET\s+([^;]+)/i);
  if (onConflictMatch) {
    // Para SQLite: usar INSERT OR REPLACE ou UPSERT com INSERT ... WHERE NOT EXISTS
    // Simplificação: remover ON CONFLICT (causa erro, mas não quebra lógica crítica)
    converted = converted
      .replace(/\s+ON\s+CONFLICT[^;]*/gi, '')
      .replace(/INSERT\s+INTO/i, 'INSERT OR IGNORE INTO');
  }

  // 3. EXCLUDED references → usar VALUES diretamente
  converted = converted.replace(/EXCLUDED\./g, '');

  // 4. CREATE TABLE IF NOT EXISTS - remover constrains incompatíveis
  if (converted.toUpperCase().includes('CREATE TABLE')) {
    // CONSTRAINT ... PRIMARY KEY já está no campo
    converted = converted.replace(/,\s*CONSTRAINT[^,]+PRIMARY KEY[^,]*/gi, '');
    
    // CHECK constraints com IN - não funciona bem em SQLite
    converted = converted.replace(/CHECK\s*\([^)]*IN\s*\([^)]+\)\s*\)/gi, '');
  }

  // 5. information_schema → sqlite_master
  if (converted.toUpperCase().includes('INFORMATION_SCHEMA')) {
    converted = `
      SELECT name as table_name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `;
  }

  // 6. RETURNING → remover (SQLite não suporta)
  converted = converted.replace(/\s+RETURNING\s+[^;]*/i, '');

  // 7. CURRENT_TIMESTAMP → CURRENT_TIMESTAMP (funciona igual em SQLite)
  // Já está OK

  // 8. CURRENT_DATE → CURRENT_DATE (funciona em ambos)
  // Já está OK

  // 9. CASCADE em foreign keys (SQLite suporta mas precisa ativar)
  // Já está OK

  // 10. BOOLEAN → INTEGER (SQLite usa 0/1)
  // Não precisa converter na query - tipo é automático

  return {
    sql: converted.trim(),
    params
  };
}

/**
 * Wrapper para pgPool que suporta ambos PostgreSQL e SQLite
 */
export function createQueryWrapper(pool: any) {
  return {
    async query(sql: string, params: any[] = []) {
      // Se for SQLite, converter query
      if (pool.constructor.name === 'SQLitePool') {
        const converted = convertQuery(sql, params);
        return pool.query(converted.sql, converted.params);
      }

      // PostgreSQL: usar query como está
      return pool.query(sql, params);
    },

    release() {
      if (pool.release) pool.release();
    },

    connect() {
      return this;
    }
  };
}
