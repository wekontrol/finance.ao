import pool from '../db/index';

/**
 * Get all keys from the base language (Portuguese)
 */
export async function getBaseLanguageKeys(): Promise<Set<string>> {
  const result = await pool.query(`
    SELECT DISTINCT key FROM translations WHERE language = 'pt' AND status = 'active'
  `);
  
  return new Set(result.rows.map((t: any) => t.key));
}

/**
 * Get all keys for a specific language
 */
export async function getLanguageKeys(language: string): Promise<Set<string>> {
  const result = await pool.query(`
    SELECT DISTINCT key FROM translations WHERE language = ? AND status = 'active'
  `, [language]);
  
  return new Set(result.rows.map((t: any) => t.key));
}

/**
 * Validate that a language has all required keys
 * Returns: { isValid: boolean, missingKeys: string[], extraKeys: string[] }
 */
export async function validateLanguageCompleteness(language: string) {
  const baseKeys = await getBaseLanguageKeys();
  const languageKeys = await getLanguageKeys(language);
  
  const missingKeys = Array.from(baseKeys).filter(key => !languageKeys.has(key));
  const extraKeys = Array.from(languageKeys).filter(key => !baseKeys.has(key));
  
  return {
    isValid: missingKeys.length === 0,
    totalRequired: baseKeys.size,
    totalHas: languageKeys.size,
    missingKeys,
    extraKeys,
    completionPercentage: baseKeys.size > 0 ? Math.round((languageKeys.size / baseKeys.size) * 100) : 0
  };
}

/**
 * Get languages that are complete (100% of keys)
 */
export async function getCompleteLanguages(): Promise<string[]> {
  const result = await pool.query(`
    SELECT DISTINCT language FROM translations WHERE status = 'active' ORDER BY language
  `);
  
  const completeLanguages: string[] = [];
  
  for (const lang of result.rows) {
    const validation = await validateLanguageCompleteness(lang.language);
    if (validation.isValid) {
      completeLanguages.push(lang.language);
    }
  }
  
  return completeLanguages;
}

/**
 * Get all languages with their completion status
 */
export async function getAllLanguagesWithStatus(): Promise<Record<string, any>> {
  const result = await pool.query(`
    SELECT DISTINCT language FROM translations WHERE status = 'active' ORDER BY language
  `);
  
  const languages: Record<string, any> = {};
  
  for (const lang of result.rows) {
    const validation = await validateLanguageCompleteness(lang.language);
    languages[lang.language] = {
      isComplete: validation.isValid,
      completionPercentage: validation.completionPercentage,
      totalKeys: validation.totalHas,
      totalRequired: validation.totalRequired,
      missingCount: validation.missingKeys.length
    };
  }
  
  return languages;
}
