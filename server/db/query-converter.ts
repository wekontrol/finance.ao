/**
 * Query Converter: Converte queries PostgreSQL para SQLite automaticamente
 */

export function convertQuery(sql: string, params: any[] = []): { sql: string; params: any[] } {
  let converted = sql;

  // Não converter se for uma operação de schema (CREATE, ALTER, etc)
  const isSchemaOp = /^\s*(CREATE|ALTER|DROP|PRAGMA)/i.test(sql);

  if (!isSchemaOp) {
    // 1. Converter $1, $2, $3... para ? (SQLite) - mantém ordem de params
    converted = converted.replace(/\$\d+/g, () => '?');

    // 2. Converter :: cast para CAST() function
    // SELECT amount::NUMERIC → SELECT CAST(amount AS NUMERIC)
    converted = converted.replace(/(\w+)::(\w+)/g, 'CAST($1 AS $2)');

    // 3. Remover ON CONFLICT
    converted = converted
      .replace(/\s+ON\s+CONFLICT[^;]*/gi, '')
      .replace(/INSERT\s+INTO/i, 'INSERT OR IGNORE INTO');

    // 4. EXCLUDED references → usar VALUES diretamente
    converted = converted.replace(/EXCLUDED\./g, '');

    // 5. information_schema → sqlite_master
    if (converted.toUpperCase().includes('INFORMATION_SCHEMA')) {
      converted = `
        SELECT name as table_name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `;
    }

    // 6. RETURNING → remover
    converted = converted.replace(/\s+RETURNING\s+[^;]*/i, '');

    // 7. INTERVAL (PostgreSQL) → não suporta em SQLite, usar date arithmetic
    // interval '1 day' → '+1 day'
    converted = converted.replace(/INTERVAL\s+'([^']+)'/gi, "'+$1'");

    // 8. ARRAY syntax → não suporta em SQLite
    // Usar string separada por vírgula
    converted = converted.replace(/ARRAY\[/g, '').replace(/\]/g, '');

    // 9. NOW() → CURRENT_TIMESTAMP
    converted = converted.replace(/NOW\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP');

    // 10. JSON operations → texto simples em SQLite
    // ->> operator → não funciona, usar parâmetros diretos
    converted = converted.replace(/->>/, '->');

    // 11. text search (tsvector) → não suporta, usar LIKE com wildcards
    // @@ operator → não existe em SQLite
    converted = converted.replace(/@@/g, 'LIKE');

    // 12. SIMILAR TO → converter para LIKE ou GLOB
    converted = converted.replace(/SIMILAR\s+TO/gi, 'LIKE');

    // 13. ILIKE (case-insensitive) → LIKE (SQLite é case-insensitive para ASCII)
    converted = converted.replace(/\bILIKE\b/gi, 'LIKE');

    // 14. REGEXP (PostgreSQL) → GLOB (SQLite)
    converted = converted.replace(/\bREGEXP\b/gi, 'GLOB');

    // 15. ~, ~*, !~ (regex operators) → GLOB ou LIKE
    converted = converted.replace(/\s~\s/g, ' GLOB ');
    converted = converted.replace(/\s~\*\s/g, ' GLOB ');
    converted = converted.replace(/\s!\~\s/g, ' NOT GLOB ');

    // 16. EXTRACT() → usar strftime()
    // EXTRACT(MONTH FROM date) → strftime('%m', date)
    converted = convertExtractToStrftime(converted);

    // 17. DATE_TRUNC() → usar strftime()
    // DATE_TRUNC('month', date) → strftime('%Y-%m-01', date)
    converted = convertDateTruncToStrftime(converted);

    // 18. COALESCE com múltiplos argumentos → OK em ambos, deixar como está
    // Já funciona igual

    // 19. UNNEST() → não suporta em SQLite
    // Deixar como está e esperar erro (feature não suportada)

    // 20. DISTINCT ON → não suporta em SQLite
    // DISTINCT ON (column) → usar DISTINCT (menos preciso, mas funciona)
    converted = converted.replace(/DISTINCT\s+ON\s*\([^)]+\)/gi, 'DISTINCT');

    // 21. String concatenation
    // 'a' || 'b' → funciona em ambos, deixar como está

    // 22. BOOLEAN tipo → SQLite usa 0/1, mas parâmetros funcionam
    // Deixar como está
  }

  return {
    sql: converted.trim(),
    params
  };
}

/**
 * Converter EXTRACT() para strftime()
 * EXTRACT(MONTH FROM date) → strftime('%m', date)
 * EXTRACT(YEAR FROM date) → strftime('%Y', date)
 * EXTRACT(DAY FROM date) → strftime('%d', date)
 */
function convertExtractToStrftime(sql: string): string {
  const extractRegex = /EXTRACT\s*\(\s*(\w+)\s+FROM\s+(\w+)\s*\)/gi;

  return sql.replace(extractRegex, (match, unit, column) => {
    const unitMap: { [key: string]: string } = {
      YEAR: '%Y',
      MONTH: '%m',
      DAY: '%d',
      HOUR: '%H',
      MINUTE: '%M',
      SECOND: '%S',
      DOW: '%w', // day of week
      DOY: '%j', // day of year
    };

    const format = unitMap[unit.toUpperCase()] || '%Y-%m-%d';
    return `strftime('${format}', ${column})`;
  });
}

/**
 * Converter DATE_TRUNC() para strftime()
 * DATE_TRUNC('month', date) → strftime('%Y-%m-01', date)
 * DATE_TRUNC('year', date) → strftime('%Y-01-01', date)
 * DATE_TRUNC('day', date) → strftime('%Y-%m-%d', date)
 */
function convertDateTruncToStrftime(sql: string): string {
  const truncRegex = /DATE_TRUNC\s*\(\s*'(\w+)'\s*,\s*(\w+)\s*\)/gi;

  return sql.replace(truncRegex, (match, unit, column) => {
    const unitMap: { [key: string]: string } = {
      year: '%Y-01-01',
      month: '%Y-%m-01',
      day: '%Y-%m-%d',
      week: '%Y-%W-01', // approximate
      hour: '%Y-%m-%d %H:00:00',
      minute: '%Y-%m-%d %H:%M:00',
      second: '%Y-%m-%d %H:%M:%S',
    };

    const format = unitMap[unit.toLowerCase()] || '%Y-%m-%d';
    return `strftime('${format}', ${column})`;
  });
}

/**
 * Wrapper para pgPool que suporta ambos PostgreSQL e SQLite
 */
export function createQueryWrapper(pool: any) {
  return {
    async query(sql: string, params: any[] = []) {
      // Se for SQLite, converter query
      if (pool.constructor.name === 'SQLitePool' || !pool.query.toString().includes('Client')) {
        const converted = convertQuery(sql, params);
        try {
          return await pool.query(converted.sql, converted.params);
        } catch (err: any) {
          console.error('SQLite query error:', {
            original: sql,
            converted: converted.sql,
            params: converted.params,
            error: err.message
          });
          throw err;
        }
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
