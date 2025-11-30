import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/schema';

const router = Router();

const LEGACY_CATEGORY_MAP: Record<string, string> = {
  'budget.category.food': 'Alimentação',
  'budget.category.transport': 'Transporte',
  'budget.category.health': 'Saúde',
  'budget.category.education': 'Educação',
  'budget.category.entertainment': 'Entretenimento',
  'budget.category.utilities': 'Utilidades',
  'budget.category.clothing': 'Vestuário',
  'budget.category.communication': 'Comunicação',
  'budget.category.insurance': 'Seguros',
  'budget.category.savings': 'Poupança',
  'budget.category.investments': 'Investimentos',
  'budget.category.leisure': 'Lazer',
  'budget.category.travel': 'Viagens',
  'budget.category.home': 'Casa',
  'budget.category.pets': 'Pets',
  'budget.category.general': 'Geral',
};

const REVERSE_LEGACY_MAP: Record<string, string> = Object.entries(LEGACY_CATEGORY_MAP).reduce(
  (acc, [key, value]) => ({ ...acc, [value]: key }),
  {}
);

export const DEFAULT_BUDGETS = [
  { translationKey: 'budget.category.food', defaultLimit: 500 },
  { translationKey: 'budget.category.transport', defaultLimit: 200 },
  { translationKey: 'budget.category.health', defaultLimit: 300 },
  { translationKey: 'budget.category.education', defaultLimit: 400 },
  { translationKey: 'budget.category.entertainment', defaultLimit: 150 },
  { translationKey: 'budget.category.utilities', defaultLimit: 350 },
  { translationKey: 'budget.category.clothing', defaultLimit: 250 },
  { translationKey: 'budget.category.communication', defaultLimit: 100 },
  { translationKey: 'budget.category.insurance', defaultLimit: 200 },
  { translationKey: 'budget.category.savings', defaultLimit: 1000 },
  { translationKey: 'budget.category.investments', defaultLimit: 500 },
  { translationKey: 'budget.category.leisure', defaultLimit: 200 },
  { translationKey: 'budget.category.travel', defaultLimit: 300 },
  { translationKey: 'budget.category.home', defaultLimit: 400 },
  { translationKey: 'budget.category.pets', defaultLimit: 150 },
  { translationKey: 'budget.category.general', defaultLimit: 500 }
];

export function createDefaultBudgetsForUser(userId: string): number {
  let created = 0;
  
  DEFAULT_BUDGETS.forEach((budget) => {
    const existing = db.prepare(`
      SELECT id FROM budget_limits WHERE user_id = ? AND translation_key = ?
    `).get(userId, budget.translationKey);

    if (!existing) {
      const budgetId = uuidv4();
      db.prepare(`
        INSERT INTO budget_limits (id, user_id, category, translation_key, limit_amount, is_default)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(budgetId, userId, budget.translationKey, budget.translationKey, budget.defaultLimit);
      created++;
    }
  });

  if (created > 0) {
    console.log(`[Budget] Created ${created} default budgets for user ${userId}`);
  }
  
  return created;
}

export function autoSaveMonthlyHistory(userId: string) {
  try {
    const lastSave = db.prepare(`
      SELECT value FROM app_settings WHERE key = ?
    `).get(`budget_history_saved_${userId}`) as any;

    const lastMonth = lastSave?.value || '2000-01';
    const currentMonth = new Date().toISOString().slice(0, 7);

    if (lastMonth !== currentMonth) {
      const previousMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
      
      const limits = db.prepare(`
        SELECT * FROM budget_limits WHERE user_id = ?
      `).all(userId);

      const transactions = db.prepare(`
        SELECT category, SUM(amount) as total
        FROM transactions
        WHERE user_id = ? AND type = 'DESPESA' AND date LIKE ?
        GROUP BY category
      `).all(userId, `${previousMonth}%`) as any[];

      let saved = 0;
      limits.forEach((limit: any) => {
        const categoryKey = limit.translation_key || limit.category;
        const legacyName = LEGACY_CATEGORY_MAP[categoryKey];
        
        const spent = transactions.find(t => 
          t.category === categoryKey || 
          t.category === limit.category ||
          (legacyName && t.category === legacyName)
        );
        const totalSpent = spent?.total || 0;
        const id = uuidv4();
        
        db.prepare(`
          INSERT OR REPLACE INTO budget_history (id, user_id, category, month, limit_amount, spent_amount)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, userId, categoryKey, previousMonth, limit.limit_amount, totalSpent);
        
        saved++;
      });

      db.prepare(`
        INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
      `).run(`budget_history_saved_${userId}`, currentMonth);

      console.log(`Auto-saved budget history for user ${userId}: ${limits.length} categories from ${previousMonth}`);
    }
  } catch (error) {
    console.error('Error in autoSaveMonthlyHistory:', error);
  }
}

export function startMonthlyHistoryScheduler() {
  const interval = setInterval(() => {
    try {
      const users = db.prepare(`
        SELECT DISTINCT user_id FROM budget_limits
      `).all() as any[];

      if (users.length > 0) {
        console.log(`[Budget Scheduler] Verificando ${users.length} usuários para auto-save do histórico...`);
        users.forEach(user => {
          autoSaveMonthlyHistory(user.user_id);
        });
      }
    } catch (error) {
      console.error('[Budget Scheduler] Error:', error);
    }
  }, 30 * 60 * 1000);

  setTimeout(() => {
    try {
      const users = db.prepare(`
        SELECT DISTINCT user_id FROM budget_limits
      `).all() as any[];
      
      if (users.length > 0) {
        console.log(`[Budget Scheduler] Execução inicial: verificando ${users.length} usuários...`);
        users.forEach(user => {
          autoSaveMonthlyHistory(user.user_id);
        });
      }
    } catch (error) {
      console.error('[Budget Scheduler] Initial run error:', error);
    }
  }, 1000);

  console.log('📅 [Budget Scheduler] Started - auto-saves history every 30 minutes');
  
  return interval;
}

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

router.use(requireAuth);

router.get('/limits', (req: Request, res: Response) => {
  const userId = req.session.userId;

  let limits = db.prepare(`
    SELECT * FROM budget_limits WHERE user_id = ?
    ORDER BY category
  `).all(userId) as any[];

  if (limits.length === 0) {
    createDefaultBudgetsForUser(userId!);
    limits = db.prepare(`
      SELECT * FROM budget_limits WHERE user_id = ?
      ORDER BY category
    `).all(userId) as any[];
  }

  const formattedLimits = limits.map((l: any) => ({
    category: l.category,
    translationKey: l.translation_key,
    limit: l.limit_amount,
    isDefault: l.is_default === 1
  }));

  res.json(formattedLimits);
});

router.post('/create-defaults', (req: Request, res: Response) => {
  const userId = req.session.userId;
  const created = createDefaultBudgetsForUser(userId!);
  res.json({ message: `Created ${created} default budgets`, created });
});

router.post('/limits', (req: Request, res: Response) => {
  const userId = req.session.userId;
  const { category, limit, translationKey } = req.body;

  if (!category || limit === undefined) {
    return res.status(400).json({ error: 'Category and limit are required' });
  }

  if (typeof limit !== 'number') {
    return res.status(400).json({ error: 'Limit must be a number' });
  }

  const categoryIdentifier = translationKey || category;
  
  const existing = db.prepare(`
    SELECT * FROM budget_limits WHERE user_id = ? AND (category = ? OR translation_key = ?)
  `).get(userId, categoryIdentifier, categoryIdentifier);

  if (existing) {
    db.prepare(`
      UPDATE budget_limits SET limit_amount = ? WHERE user_id = ? AND (category = ? OR translation_key = ?)
    `).run(limit, userId, categoryIdentifier, categoryIdentifier);
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO budget_limits (id, user_id, category, translation_key, limit_amount, is_default)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(id, userId, category, translationKey || null, limit);
  }

  res.json({ category, limit, translationKey });
});

router.delete('/limits/:category', (req: Request, res: Response) => {
  const userId = req.session.userId;
  const { category } = req.params;
  const decodedCategory = decodeURIComponent(category);

  const budget = db.prepare(`
    SELECT is_default, translation_key FROM budget_limits WHERE user_id = ? AND (category = ? OR translation_key = ?)
  `).get(userId, decodedCategory, decodedCategory) as any;

  if (budget?.is_default === 1) {
    return res.status(403).json({ error: 'Não pode deletar orçamentos padrão' });
  }

  db.prepare(`
    UPDATE transactions SET category = 'budget.category.general' WHERE user_id = ? AND category = ?
  `).run(userId, decodedCategory);

  db.prepare(`
    DELETE FROM budget_limits WHERE user_id = ? AND (category = ? OR translation_key = ?)
  `).run(userId, decodedCategory, decodedCategory);

  res.json({ message: 'Budget deleted and transactions moved to General' });
});

router.get('/summary', (req: Request, res: Response) => {
  const userId = req.session.userId;

  const currentMonth = new Date().toISOString().slice(0, 7);

  let limits = db.prepare(`
    SELECT * FROM budget_limits WHERE user_id = ?
  `).all(userId) as any[];

  if (limits.length === 0) {
    createDefaultBudgetsForUser(userId!);
    limits = db.prepare(`
      SELECT * FROM budget_limits WHERE user_id = ?
    `).all(userId) as any[];
  }

  const transactions = db.prepare(`
    SELECT category, SUM(amount) as total
    FROM transactions
    WHERE user_id = ? AND type = 'DESPESA' AND date LIKE ?
    GROUP BY category
  `).all(userId, `${currentMonth}%`);

  const summary = limits.map((l: any) => {
    const categoryKey = l.translation_key || l.category;
    const legacyName = LEGACY_CATEGORY_MAP[categoryKey];
    
    const spent = (transactions as any[]).find(t => 
      t.category === categoryKey || 
      t.category === l.category ||
      (legacyName && t.category === legacyName)
    );
    
    return {
      category: l.category,
      translationKey: l.translation_key,
      limit: l.limit_amount,
      spent: spent ? spent.total : 0,
      percentage: spent ? Math.round((spent.total / l.limit_amount) * 100) : 0,
      isDefault: l.is_default === 1
    };
  });

  res.json(summary);
});

router.get('/history', (req: Request, res: Response) => {
  const userId = req.session.userId;
  
  const history = db.prepare(`
    SELECT * FROM budget_history 
    WHERE user_id = ? 
    ORDER BY month DESC 
    LIMIT 12
  `).all(userId);

  const grouped = history.reduce((acc: any, row: any) => {
    if (!acc[row.month]) {
      acc[row.month] = [];
    }
    acc[row.month].push({
      category: row.category,
      limit: row.limit_amount,
      spent: row.spent_amount
    });
    return acc;
  }, {});

  res.json(grouped);
});

router.post('/history/save', (req: Request, res: Response) => {
  const userId = req.session.userId;
  const currentMonth = new Date().toISOString().slice(0, 7);

  try {
    const limits = db.prepare(`
      SELECT * FROM budget_limits WHERE user_id = ?
    `).all(userId);

    const transactions = db.prepare(`
      SELECT category, SUM(amount) as total
      FROM transactions
      WHERE user_id = ? AND type = 'DESPESA' AND date LIKE ?
      GROUP BY category
    `).all(userId, `${currentMonth}%`) as any[];

    let saved = 0;
    limits.forEach((limit: any) => {
      const categoryKey = limit.translation_key || limit.category;
      const spent = transactions.find(t => t.category === categoryKey || t.category === limit.category);
      const id = uuidv4();
      
      db.prepare(`
        INSERT OR REPLACE INTO budget_history (id, user_id, category, month, limit_amount, spent_amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, userId, categoryKey, currentMonth, limit.limit_amount, spent ? spent.total : 0);
      
      saved++;
    });

    res.json({ message: `Histórico de ${saved} categorias salvo para ${currentMonth}` });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar histórico' });
  }
});

export default router;
