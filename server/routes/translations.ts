import { Router, Request, Response } from 'express';
import db from '../db/schema';
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
router.get('/languages', (req: Request, res: Response) => {
  const completeLanguages = getCompleteLanguages();
  res.json(completeLanguages);
});

// Admin endpoint - get ALL languages with their completion status
router.get('/languages/all', requireTranslatorOrAdmin, (req: Request, res: Response) => {
  const allLanguages = getAllLanguagesWithStatus();
  res.json(allLanguages);
});

// Admin endpoint - validate a specific language
router.get('/validate/:language', requireTranslatorOrAdmin, (req: Request, res: Response) => {
  const { language } = req.params;
  const validation = validateLanguageCompleteness(language);
  res.json(validation);
});

router.use(requireAuth);

// Get all translations for a language
router.get('/language/:language', (req: Request, res: Response) => {
  const { language } = req.params;
  
  const translations = db.prepare(`
    SELECT key, value FROM translations WHERE language = ? AND status = 'active'
    ORDER BY key
  `).all(language);

  const result: Record<string, string> = {};
  translations.forEach((t: any) => {
    result[t.key] = t.value;
  });

  res.json(result);
});

// Get all translation keys and languages (for translator editor)
router.get('/editor/all', requireTranslatorOrAdmin, (req: Request, res: Response) => {
  const translations = db.prepare(`
    SELECT DISTINCT language, key, value, created_by, updated_at
    FROM translations
    WHERE status = 'active'
    ORDER BY language, key
  `).all();

  res.json(translations);
});

// Save translation
router.post('/', requireTranslatorOrAdmin, (req: Request, res: Response) => {
  const userId = req.session.userId;
  const { language, key, value } = req.body;

  if (!language || !key || !value) {
    return res.status(400).json({ error: 'Language, key, and value are required' });
  }

  const id = `tr${Date.now()}${Math.random().toString(36).substr(2, 9)}`;

  try {
    db.prepare(`
      INSERT OR REPLACE INTO translations (id, language, key, value, created_by, updated_at, status)
      VALUES (?, ?, ?, ?, ?, datetime('now'), 'active')
    `).run(id, language, key, value, userId);

    res.status(201).json({ id, language, key, value });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Add new language
router.post('/language/add', requireTranslatorOrAdmin, (req: Request, res: Response) => {
  const { language, baseLanguage } = req.body;
  const userId = req.session.userId;

  if (!language) {
    return res.status(400).json({ error: 'Language code is required' });
  }

  // If baseLanguage provided, copy translations from base
  if (baseLanguage) {
    const baseTranslations = db.prepare(`
      SELECT key, value FROM translations WHERE language = ? AND status = 'active'
    `).all(baseLanguage);

    baseTranslations.forEach((t: any) => {
      const id = `tr${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
      db.prepare(`
        INSERT OR IGNORE INTO translations (id, language, key, value, created_by, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(id, language, t.key, t.value, userId);
    });
  }

  // Validate the new language
  const validation = validateLanguageCompleteness(language);
  
  res.json({ 
    message: `Language ${language} added successfully`,
    validation
  });
});

// Export translations as JSON
router.get('/export', requireTranslatorOrAdmin, (req: Request, res: Response) => {
  try {
    const translations = db.prepare(`
      SELECT language, key, value FROM translations WHERE status = 'active' ORDER BY language, key
    `).all();

    const languages = [...new Set(translations.map((t: any) => t.language))];
    const allKeys = [...new Set(translations.map((t: any) => t.key))];
    
    const result: Record<string, Record<string, string>> = {};
    
    languages.forEach(lang => {
      result[lang] = {};
      allKeys.forEach(key => {
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
router.post('/import', requireTranslatorOrAdmin, (req: Request, res: Response) => {
  const userId = req.session.userId;
  const { language, translations: importedTranslations } = req.body;

  if (!language || !importedTranslations || typeof importedTranslations !== 'object') {
    return res.status(400).json({ error: 'Language and translations object are required' });
  }

  try {
    let count = 0;
    for (const [key, value] of Object.entries(importedTranslations)) {
      if (value && typeof value === 'string' && value.trim()) {
        const id = `tr${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
        db.prepare(`
          INSERT OR REPLACE INTO translations (id, language, key, value, created_by, updated_at, status)
          VALUES (?, ?, ?, ?, ?, datetime('now'), 'active')
        `).run(id, language, key, value, userId);
        count++;
      }
    }
    
    res.json({ message: `Imported ${count} translations for ${language}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics/completion percentage
router.get('/stats', requireTranslatorOrAdmin, (req: Request, res: Response) => {
  try {
    const languages = db.prepare(`
      SELECT DISTINCT language FROM translations WHERE status = 'active'
    `).all() as any[];

    // Get total distinct keys
    const totalResult = db.prepare(`
      SELECT COUNT(DISTINCT key) as count FROM translations WHERE status = 'active'
    `).get() as any;
    const totalKeys = totalResult?.count || 0;

    const stats = languages.map((row: any) => {
      const lang = row.language;
      
      const translatedResult = db.prepare(`
        SELECT COUNT(*) as count FROM translations 
        WHERE language = ? AND status = 'active' AND value IS NOT NULL AND value != ''
      `).get(lang) as any;
      const translated = translatedResult?.count || 0;

      return {
        language: lang,
        total: totalKeys,
        translated: translated,
        percentage: totalKeys ? Math.round((translated / totalKeys) * 100) : 0
      };
    });

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get translation history
router.get('/history', requireTranslatorOrAdmin, (req: Request, res: Response) => {
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
      query += ' AND h.language = ?';
      params.push(language);
    }
    if (key) {
      query += ' AND h.key LIKE ?';
      params.push(`%${key}%`);
    }
    
    query += ' ORDER BY h.changed_at DESC LIMIT ?';
    params.push(Number(limit));
    
    const history = db.prepare(query).all(...params);
    res.json(history);
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
    
    // Try to use Puter AI (free, no API key needed)
    try {
      const prompt = `Translate the following text from ${fromName} to ${toName}. 
Only return the translated text, nothing else.
Keep the same tone and style.
If it's a UI element (button, label, menu item), keep it concise.

Text to translate: "${text}"`;

      // Use fetch to call Puter API directly
      const response = await fetch('https://api.puter.com/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: 'gpt-4o-mini'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const translation = data.message?.content || data.choices?.[0]?.message?.content || '';
        return res.json({ 
          translation: translation.trim().replace(/^["']|["']$/g, ''),
          provider: 'puter'
        });
      }
    } catch (puterError) {
      console.log('[AI Translate] Puter failed, trying fallback...');
    }
    
    // Fallback: simple dictionary for common words
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
router.post('/save-with-history', requireTranslatorOrAdmin, (req: Request, res: Response) => {
  const userId = req.session.userId;
  const { language, key, value } = req.body;

  if (!language || !key || !value) {
    return res.status(400).json({ error: 'Language, key, and value are required' });
  }

  try {
    // Get old value for history
    const existing = db.prepare(
      'SELECT id, value FROM translations WHERE language = ? AND key = ? AND status = ?'
    ).get(language, key, 'active') as any;
    
    const oldValue = existing?.value || null;
    const translationId = existing?.id || `tr${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    
    // Save new translation
    db.prepare(`
      INSERT OR REPLACE INTO translations (id, language, key, value, created_by, updated_at, status)
      VALUES (?, ?, ?, ?, ?, datetime('now'), 'active')
    `).run(translationId, language, key, value, userId);
    
    // Save history if value changed
    if (oldValue !== value) {
      const historyId = `th${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
      db.prepare(`
        INSERT INTO translation_history (id, translation_id, language, key, old_value, new_value, changed_by, change_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(historyId, translationId, language, key, oldValue, value, userId, oldValue ? 'update' : 'create');
    }

    res.status(201).json({ id: translationId, language, key, value, historyRecorded: oldValue !== value });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
