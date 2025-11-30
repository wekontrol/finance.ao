/**
 * Query Converter: Converte entre MySQL e SQLite automaticamente
 * Compatibilidade máxima com ambos os bancos
 */

export function convertQuery(sql: string, params: any[] = []): { sql: string; params: any[] } {
  let converted = sql;

  // Não converter se for operação de schema
  const isSchemaOp = /^\s*(CREATE|ALTER|DROP|PRAGMA|USE)/i.test(sql);

  if (!isSchemaOp) {
    // 1. Converter $1, $2... para ? (MySQL/SQLite compatível)
    converted = converted.replace(/\$\d+/g, () => '?');

    // 2. Remover ON CONFLICT (MySQL usa ON DUPLICATE KEY UPDATE)
    // Por simplicidade, vamos ignorar conflitos (INSERT OR IGNORE)
    converted = converted
      .replace(/\s+ON\s+CONFLICT[^;]*/gi, '')
      .replace(/INSERT\s+INTO/i, 'INSERT IGNORE INTO');

    // 3. EXCLUDED references
    converted = converted.replace(/EXCLUDED\./g, 'VALUES(');

    // 4. INTERVAL - converter para DATE arithmetic
    // interval '1 day' → DATE_ADD(NOW(), INTERVAL 1 DAY)
    converted = converted.replace(
      /NOW\s*\(\s*\)\s*-\s*INTERVAL\s+'([^']+)'/gi,
      "DATE_SUB(NOW(), INTERVAL '$1')"
    );
    converted = converted.replace(
      /INTERVAL\s+'([^']+)'/gi,
      "INTERVAL '$1'"
    );

    // 5. EXTRACT - converter para DATE_FORMAT (compatível com ambos)
    converted = convertExtractToDateFormat(converted);

    // 6. datetime() SQLite → MySQL compatible
    converted = converted.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'NOW()');
    converted = converted.replace(/CURRENT_TIMESTAMP/gi, 'NOW()');

    // 7. strftime - converter para DATE_FORMAT
    converted = convertStrftimeToDateFormat(converted);

    // 8. CAST - já funciona igual em ambos
    // Deixar como está

    // 9. LIKE - funciona igual em ambos
    // Deixar como está

    // 10. BOOLEAN - MySQL usa TINYINT(1), SQLite usa INTEGER
    // Deixar params como estão, MySQL converte automaticamente

    // 11. Types - database agnostic na maioria dos casos
    // TEXT, INTEGER, REAL funcionam em ambos
  }

  return {
    sql: converted.trim(),
    params
  };
}

/**
 * Converter EXTRACT() para DATE_FORMAT() (compatível com ambos)
 */
function convertExtractToDateFormat(sql: string): string {
  const extractRegex = /EXTRACT\s*\(\s*(\w+)\s+FROM\s+(\w+)\s*\)/gi;

  return sql.replace(extractRegex, (match, unit, column) => {
    const unitMap: { [key: string]: string } = {
      YEAR: '%Y',
      MONTH: '%m',
      DAY: '%d',
      HOUR: '%H',
      MINUTE: '%i',
      SECOND: '%s',
    };

    const format = unitMap[unit.toUpperCase()] || '%Y-%m-%d';
    return `DATE_FORMAT(${column}, '${format}')`;
  });
}

/**
 * Converter strftime() SQLite para DATE_FORMAT() MySQL
 */
function convertStrftimeToDateFormat(sql: string): string {
  // strftime('%Y-%m-%d', date) → DATE_FORMAT(date, '%Y-%m-%d')
  const strftimeRegex = /strftime\s*\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/gi;

  return sql.replace(strftimeRegex, (match, format, column) => {
    // strftime usa %Y, %m, %d, %H, %M, %S (compatível com MySQL)
    return `DATE_FORMAT(${column}, '${format}')`;
  });
}

/**
 * Wrapper para pool que suporta MySQL e SQLite
 */
export function createQueryWrapper(pool: any) {
  return {
    async query(sql: string, params: any[] = []) {
      // Converter query
      const converted = convertQuery(sql, params);

      try {
        // MySQL 2 retorna array [rows, fields]
        const result = await pool.query(converted.sql, converted.params);
        
        // Normalizar para formato consistente
        if (Array.isArray(result)) {
          return { rows: result[0] || [] };
        }
        return result;
      } catch (err: any) {
        console.error('Database query error:', {
          original: sql,
          converted: converted.sql,
          params: converted.params,
          error: err.message,
          errorCode: err.code,
          errorState: err.sqlState
        });
        throw err;
      }
    },

    release() {
      if (pool.release) pool.release();
    },

    connect() {
      return this;
    }
  };
}

/**
 * Helper para calcular data de fim do mês (compatível MySQL/SQLite)
 */
export function getMonthEndDate(dateStr: string): string {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return date.toISOString().split('T')[0];
}
