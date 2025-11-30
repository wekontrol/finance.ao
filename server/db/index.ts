/**
 * Database pool com suporte automático para MySQL e SQLite
 * SQLite para desenvolvimento
 * MySQL para produção (máxima compatibilidade)
 */
import mysqlPool from './mysql';
import { createQueryWrapper } from './query-converter';

// Exportar pool com wrapper inteligente
export default createQueryWrapper(mysqlPool);
export { mysqlPool as rawPool };
