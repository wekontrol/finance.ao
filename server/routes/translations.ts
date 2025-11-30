import { Router, Request, Response } from 'express';
import pgPool from '../db';
import { getCompleteLanguages, getAllLanguagesWithStatus, validateLanguageCompleteness } from '../utils/validateLanguage';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireTranslatorOrAdmin(req: Request, res: Response, next: Function) {
  if (!req.session.user || (req.session.user.role !== 'TRANSLATOR' && req.session.user.role !== 'SUPER_ADMIN')) {
    return res.status(403).json({ error: 'Only translators and admins can access this' });
  }
  next();
}

// Public endpoint - get ONLY COMPLETE languages (no auth required)
router.get('/languages', async (req: Request, res: Response) => {
  try {
    const completeLanguages = await getCompleteLanguages();
    res.json(completeLanguages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoint - get ALL languages with their completion status
router.get('/languages/all', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  try {
    const allLanguages = await getAllLanguagesWithStatus();
    res.json(allLanguages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoint - validate a specific language
router.get('/validate/:language', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  try {
    const { language } = req.params;
    const validation = await validateLanguageCompleteness(language);
    res.json(validation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.use(requireAuth);

// Get all translations for a language
router.get('/language/:language', async (req: Request, res: Response) => {
  try {
    const { language } = req.params;
    
    const translationsResult = await pgPool.query(`
      SELECT \`key\`, \`value\` FROM translations WHERE language = ? AND status = 'active'
      ORDER BY \`key\`
    `, [language]);

    const result: Record<string, string> = {};
    translationsResult.rows.forEach((t: any) => {
      result[t.key] = t.value;
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all translation keys and languages (for translator editor)
router.get('/editor/all', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pgPool.query(`
      SELECT DISTINCT language, \`key\`, \`value\`, created_by, updated_at
      FROM translations
      WHERE status = 'active'
      ORDER BY language, \`key\`
    `);

    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save translation
router.post('/', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  const userId = req.session.userId || 'u0'; // Default to admin if not set
  const { language, key, value } = req.body;

  if (!language || !key || !value) {
    return res.status(400).json({ error: 'Language, key, and value are required' });
  }

  const id = `tr${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

  try {
    const now = new Date().toISOString();
    await pgPool.query(`
      INSERT INTO translations (id, language, \`key\`, \`value\`, created_by, updated_at, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
      ON DUPLICATE KEY UPDATE
        \`value\` = ?,
        updated_at = ?,
        status = 'active'
    `, [id, language, key, value, userId, now, value, now]);

    res.status(201).json({ id, language, key, value });
  } catch (error: any) {
    console.error('[POST /translations] Error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Add new language
router.post('/language/add', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  const { language, baseLanguage } = req.body;
  const userId = req.session.userId;

  if (!language) {
    return res.status(400).json({ error: 'Language code is required' });
  }

  try {
    // If baseLanguage provided, copy translations from base
    if (baseLanguage) {
      const baseResult = await pgPool.query(`
        SELECT \`key\`, \`value\` FROM translations WHERE language = ? AND status = 'active'
      `, [baseLanguage]);

      for (const t of baseResult.rows) {
        const id = `tr${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
        await pgPool.query(`
          INSERT IGNORE INTO translations (id, language, \`key\`, \`value\`, created_by, status)
          VALUES (?, ?, ?, ?, ?, 'active')
        `, [id, language, t.key, t.value, userId]);
      }
    }

    // Validate the new language
    const validation = await validateLanguageCompleteness(language);
    
    res.json({ 
      message: `Language ${language} added successfully`,
      validation
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Export translations as JSON
router.get('/export', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  try {
    const translationsResult = await pgPool.query(`
      SELECT language, \`key\`, \`value\` FROM translations WHERE status = 'active' ORDER BY language, \`key\`
    `);

    const translations = translationsResult.rows;
    const languages = [...new Set(translations.map((t: any) => t.language))];
    const allKeys = [...new Set(translations.map((t: any) => t.key))];
    
    const result: Record<string, Record<string, string>> = {};
    
    languages.forEach((lang: any) => {
      result[lang] = {};
      allKeys.forEach((key: any) => {
        const trans = translations.find((t: any) => t.language === lang && t.key === key) as { value?: string } | undefined;
        result[lang][key] = trans?.value || '';
      });
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Import translations from JSON
router.post('/import', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const { language, translations: importedTranslations } = req.body;

  if (!language || !importedTranslations || typeof importedTranslations !== 'object') {
    return res.status(400).json({ error: 'Language and translations object are required' });
  }

  try {
    let count = 0;
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(importedTranslations)) {
      if (value && typeof value === 'string' && value.trim()) {
        const id = `tr${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
        await pgPool.query(`
          INSERT INTO translations (id, language, key, value, created_by, updated_at, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')
          ON DUPLICATE KEY UPDATE
            value = ?,
            created_by = ?,
            updated_at = ?,
            status = 'active'
        `, [id, language, key, value, userId, now, value, userId, now]);
        count++;
      }
    }
    
    res.json({ message: `Imported ${count} translations for ${language}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics/completion percentage
router.get('/stats', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  try {
    const languagesResult = await pgPool.query(`
      SELECT DISTINCT language FROM translations WHERE status = 'active'
    `);

    // Get total distinct keys
    const totalResult = await pgPool.query(`
      SELECT COUNT(DISTINCT key) as count FROM translations WHERE status = 'active'
    `);
    const totalKeys = parseInt(totalResult.rows[0]?.count) || 0;

    const stats = await Promise.all(languagesResult.rows.map(async (row: any) => {
      const lang = row.language;
      
      const translatedResult = await pgPool.query(`
        SELECT COUNT(*) as count FROM translations 
        WHERE language = ? AND status = 'active' AND value IS NOT NULL AND value != ''
      `, [lang]);
      const translated = parseInt(translatedResult.rows[0]?.count) || 0;

      return {
        language: lang,
        total: totalKeys,
        translated: translated,
        percentage: totalKeys ? Math.round((translated / totalKeys) * 100) : 0
      };
    }));

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get translation history
router.get('/history', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  try {
    const { language, key, limit = 50 } = req.query;
    
    let query = `
      SELECT h.*, u.name as user_name 
      FROM translation_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (language) {
      query += ` AND h.language = ?`;
      params.push(language);
    }
    if (key) {
      query += ` AND h.key LIKE ?`;
      params.push(`%${key}%`);
    }
    
    query += ` ORDER BY h.changed_at DESC LIMIT ?`;
    params.push(Number(limit));
    
    const result = await pgPool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// AI Translation suggestion
router.post('/ai-translate', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  try {
    const { text, fromLang, toLang } = req.body;
    
    if (!text || !fromLang || !toLang) {
      return res.status(400).json({ error: 'text, fromLang, and toLang are required' });
    }
    
    // Language names for better AI context
    const langNames: Record<string, string> = {
      pt: 'Portuguese',
      en: 'English', 
      es: 'Spanish',
      fr: 'French',
      um: 'Umbundu (Angolan language)',
      ln: 'Lingala (Central African language)',
      de: 'German',
      it: 'Italian'
    };
    
    const fromName = langNames[fromLang] || fromLang;
    const toName = langNames[toLang] || toLang;
    
    // Simple dictionary for common words
    const commonTranslations: Record<string, Record<string, string>> = {
      'Save': { fr: 'Enregistrer', es: 'Guardar', um: 'Okusika', ln: 'Kobomba' },
      'Cancel': { fr: 'Annuler', es: 'Cancelar', um: 'Okutondola', ln: 'Koboya' },
      'Back': { fr: 'Retour', es: 'Volver', um: 'Okuwila', ln: 'Kozonga' },
      'Next': { fr: 'Suivant', es: 'Siguiente', um: 'Okiliki', ln: 'Elandi' },
      'Delete': { fr: 'Supprimer', es: 'Eliminar', um: 'Okufuta', ln: 'Kolongola' },
      'Edit': { fr: 'Modifier', es: 'Editar', um: 'Okuwandekesa', ln: 'Kobongola' },
      'Add': { fr: 'Ajouter', es: 'Añadir', um: 'Okuwiya', ln: 'Kobakisa' },
      'Close': { fr: 'Fermer', es: 'Cerrar', um: 'Okukila', ln: 'Kokanga' },
      'Confirm': { fr: 'Confirmer', es: 'Confirmar', um: 'Okutima', ln: 'Kondima' }
    };
    
    if (commonTranslations[text]?.[toLang]) {
      return res.json({ 
        translation: commonTranslations[text][toLang],
        provider: 'dictionary'
      });
    }
    
    return res.json({ 
      translation: text,
      provider: 'none',
      message: 'AI translation unavailable. Please translate manually.'
    });
    
  } catch (error: any) {
    console.error('[AI Translate] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save translation WITH history
router.post('/save-with-history', requireTranslatorOrAdmin, async (req: Request, res: Response) => {
  const userId = req.session.userId || 'u0'; // Default to admin if not set
  const { language, key, value } = req.body;

  if (!language || !key || !value) {
    return res.status(400).json({ error: 'Language, key, and value are required' });
  }

  try {
    // Get old value for history
    const existingResult = await pgPool.query(
      'SELECT id, value FROM translations WHERE language = ? AND key = ? AND status = ?',
      [language, key, 'active']
    );
    const existing = existingResult.rows[0];
    
    const oldValue = existing?.value || null;
    const translationId = existing?.id || `tr${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    
    // Save new translation
    await pgPool.query(`
      INSERT INTO translations (id, language, key, value, created_by, updated_at, status)
      VALUES (?, ?, ?, ?, ?, NOW(), 'active')
      ON DUPLICATE KEY UPDATE
        value = ?,
        updated_at = NOW(),
        status = 'active'
    `, [translationId, language, key, value, userId]);
    
    // Save history if value changed
    if (oldValue !== value) {
      const historyId = `th${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
      await pgPool.query(`
        INSERT INTO translation_history (id, translation_id, language, key, old_value, new_value, changed_by, change_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [historyId, translationId, language, key, oldValue, value, userId, oldValue ? 'update' : 'create']);
    }

    res.status(201).json({ id: translationId, language, key, value, historyRecorded: oldValue !== value });
  } catch (error: any) {
    console.error('[POST /save-with-history] Error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
