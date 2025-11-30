import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pgPool from '../db/postgres';

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

export async function createDefaultBudgetsForUser(userId: string): Promise<number> {
  let created = 0;
  
  for (const budget of DEFAULT_BUDGETS) {
    const existingResult = await pgPool.query(
      `SELECT id FROM budget_limits WHERE user_id = $1 AND translation_key = $2`,
      [userId, budget.translationKey]
    );

    if (existingResult.rows.length === 0) {
      const budgetId = uuidv4();
      await pgPool.query(
        `INSERT INTO budget_limits (id, user_id, category, translation_key, limit_amount, is_default)
         VALUES ($1, $2, $3, $4, $5, 1)`,
        [budgetId, userId, budget.translationKey, budget.translationKey, budget.defaultLimit]
      );
      created++;
    }
  }

  if (created > 0) {
    console.log(`[Budget] Created ${created} default budgets for user ${userId}`);
  }
  
  return created;
}

export async function autoSaveMonthlyHistory(userId: string) {
  try {
    const lastSaveResult = await pgPool.query(
      `SELECT value FROM app_settings WHERE key = $1`,
      [`budget_history_saved_${userId}`]
    );

    const lastMonth = lastSaveResult.rows[0]?.value || '2000-01';
    const currentMonth = new Date().toISOString().slice(0, 7);

    if (lastMonth !== currentMonth) {
      const previousMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
      
      const limitsResult = await pgPool.query(
        `SELECT * FROM budget_limits WHERE user_id = $1`,
        [userId]
      );
      const limits = limitsResult.rows;

      const transactionsResult = await pgPool.query(
        `SELECT category, SUM(amount) as total
         FROM transactions
         WHERE user_id = $1 AND type = 'DESPESA' AND date LIKE $2
         GROUP BY category`,
        [userId, `${previousMonth}%`]
      );
      const transactions = transactionsResult.rows;

      let saved = 0;
      for (const limit of limits) {
        const categoryKey = limit.translation_key || limit.category;
        const legacyName = LEGACY_CATEGORY_MAP[categoryKey];
        
        const spent = transactions.find(t => 
          t.category === categoryKey || 
          t.category === limit.category ||
          (legacyName && t.category === legacyName)
        );
        const totalSpent = spent?.total || 0;
        const id = uuidv4();
        
        await pgPool.query(
          `INSERT INTO budget_history (id, user_id, category, month, limit_amount, spent_amount)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, category, month) DO UPDATE SET
             limit_amount = EXCLUDED.limit_amount,
             spent_amount = EXCLUDED.spent_amount`,
          [id, userId, categoryKey, previousMonth, limit.limit_amount, totalSpent]
        );
        
        saved++;
      }

      await pgPool.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [`budget_history_saved_${userId}`, currentMonth]
      );

      console.log(`Auto-saved budget history for user ${userId}: ${limits.length} categories from ${previousMonth}`);
    }
  } catch (error) {
    console.error('Error in autoSaveMonthlyHistory:', error);
  }
}

export async function startMonthlyHistoryScheduler() {
  const runScheduler = async () => {
    try {
      const usersResult = await pgPool.query(
        `SELECT DISTINCT user_id FROM budget_limits`
      );
      const users = usersResult.rows;

      if (users.length > 0) {
        console.log(`[Budget Scheduler] Verificando ${users.length} usuários para auto-save do histórico...`);
        for (const user of users) {
          await autoSaveMonthlyHistory(user.user_id);
        }
      }
    } catch (error) {
      console.error('[Budget Scheduler] Error:', error);
    }
  };

  const interval = setInterval(runScheduler, 30 * 60 * 1000);

  setTimeout(async () => {
    try {
      const usersResult = await pgPool.query(
        `SELECT DISTINCT user_id FROM budget_limits`
      );
      const users = usersResult.rows;
      
      if (users.length > 0) {
        console.log(`[Budget Scheduler] Execução inicial: verificando ${users.length} usuários...`);
        for (const user of users) {
          await autoSaveMonthlyHistory(user.user_id);
        }
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

router.get('/limits', async (req: Request, res: Response) => {
  const userId = req.session.userId;

  let limitsResult = await pgPool.query(
    `SELECT * FROM budget_limits WHERE user_id = $1
     ORDER BY category`,
    [userId]
  );
  let limits = limitsResult.rows;

  if (limits.length === 0) {
    await createDefaultBudgetsForUser(userId!);
    limitsResult = await pgPool.query(
      `SELECT * FROM budget_limits WHERE user_id = $1
       ORDER BY category`,
      [userId]
    );
    limits = limitsResult.rows;
  }

  const formattedLimits = limits.map((l: any) => ({
    category: l.category,
    translationKey: l.translation_key,
    limit: l.limit_amount,
    isDefault: l.is_default === 1 || l.is_default === true
  }));

  res.json(formattedLimits);
});

router.post('/create-defaults', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const created = await createDefaultBudgetsForUser(userId!);
  res.json({ message: `Created ${created} default budgets`, created });
});

router.post('/limits', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const { category, limit, translationKey } = req.body;

  if (!category || limit === undefined) {
    return res.status(400).json({ error: 'Category and limit are required' });
  }

  if (typeof limit !== 'number') {
    return res.status(400).json({ error: 'Limit must be a number' });
  }

  const categoryIdentifier = translationKey || category;
  
  const existingResult = await pgPool.query(
    `SELECT * FROM budget_limits WHERE user_id = $1 AND (category = $2 OR translation_key = $3)`,
    [userId, categoryIdentifier, categoryIdentifier]
  );
  const existing = existingResult.rows[0];

  if (existing) {
    await pgPool.query(
      `UPDATE budget_limits SET limit_amount = $1 WHERE user_id = $2 AND (category = $3 OR translation_key = $4)`,
      [limit, userId, categoryIdentifier, categoryIdentifier]
    );
  } else {
    const id = uuidv4();
    await pgPool.query(
      `INSERT INTO budget_limits (id, user_id, category, translation_key, limit_amount, is_default)
       VALUES ($1, $2, $3, $4, $5, 0)`,
      [id, userId, category, translationKey || null, limit]
    );
  }

  res.json({ category, limit, translationKey });
});

router.delete('/limits/:category', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const { category } = req.params;
  const decodedCategory = decodeURIComponent(category);

  const budgetResult = await pgPool.query(
    `SELECT is_default, translation_key FROM budget_limits WHERE user_id = $1 AND (category = $2 OR translation_key = $3)`,
    [userId, decodedCategory, decodedCategory]
  );
  const budget = budgetResult.rows[0];

  if (budget?.is_default === 1 || budget?.is_default === true) {
    return res.status(403).json({ error: 'Não pode deletar orçamentos padrão' });
  }

  await pgPool.query(
    `UPDATE transactions SET category = 'budget.category.general' WHERE user_id = $1 AND category = $2`,
    [userId, decodedCategory]
  );

  await pgPool.query(
    `DELETE FROM budget_limits WHERE user_id = $1 AND (category = $2 OR translation_key = $3)`,
    [userId, decodedCategory, decodedCategory]
  );

  res.json({ message: 'Budget deleted and transactions moved to General' });
});

router.get('/summary', async (req: Request, res: Response) => {
  const userId = req.session.userId;

  const currentMonth = new Date().toISOString().slice(0, 7);

  let limitsResult = await pgPool.query(
    `SELECT * FROM budget_limits WHERE user_id = $1`,
    [userId]
  );
  let limits = limitsResult.rows;

  if (limits.length === 0) {
    await createDefaultBudgetsForUser(userId!);
    limitsResult = await pgPool.query(
      `SELECT * FROM budget_limits WHERE user_id = $1`,
      [userId]
    );
    limits = limitsResult.rows;
  }

  const transactionsResult = await pgPool.query(
    `SELECT category, SUM(amount) as total
     FROM transactions
     WHERE user_id = $1 AND type = 'DESPESA' AND date LIKE $2
     GROUP BY category`,
    [userId, `${currentMonth}%`]
  );
  const transactions = transactionsResult.rows;

  const summary = limits.map((l: any) => {
    const categoryKey = l.translation_key || l.category;
    const legacyName = LEGACY_CATEGORY_MAP[categoryKey];
    
    const spent = transactions.find(t => 
      t.category === categoryKey || 
      t.category === l.category ||
      (legacyName && t.category === legacyName)
    );
    
    return {
      category: l.category,
      translationKey: l.translation_key,
      limit: l.limit_amount,
      spent: spent ? parseFloat(spent.total) : 0,
      percentage: spent ? Math.round((parseFloat(spent.total) / l.limit_amount) * 100) : 0,
      isDefault: l.is_default === 1 || l.is_default === true
    };
  });

  res.json(summary);
});

router.get('/history', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  
  const historyResult = await pgPool.query(
    `SELECT * FROM budget_history 
     WHERE user_id = $1 
     ORDER BY month DESC 
     LIMIT 12`,
    [userId]
  );
  const history = historyResult.rows;

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

router.post('/history/save', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const currentMonth = new Date().toISOString().slice(0, 7);

  try {
    const limitsResult = await pgPool.query(
      `SELECT * FROM budget_limits WHERE user_id = $1`,
      [userId]
    );
    const limits = limitsResult.rows;

    const transactionsResult = await pgPool.query(
      `SELECT category, SUM(amount) as total
       FROM transactions
       WHERE user_id = $1 AND type = 'DESPESA' AND date LIKE $2
       GROUP BY category`,
      [userId, `${currentMonth}%`]
    );
    const transactions = transactionsResult.rows;

    let saved = 0;
    for (const limit of limits) {
      const categoryKey = limit.translation_key || limit.category;
      const spent = transactions.find(t => t.category === categoryKey || t.category === limit.category);
      const id = uuidv4();
      
      await pgPool.query(
        `INSERT INTO budget_history (id, user_id, category, month, limit_amount, spent_amount)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, category, month) DO UPDATE SET
           limit_amount = EXCLUDED.limit_amount,
           spent_amount = EXCLUDED.spent_amount`,
        [id, userId, categoryKey, currentMonth, limit.limit_amount, spent ? parseFloat(spent.total) : 0]
      );
      
      saved++;
    }

    res.json({ message: `Histórico de ${saved} categorias salvo para ${currentMonth}` });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar histórico' });
  }
});

export default router;
