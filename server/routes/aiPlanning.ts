import { Router, Request, Response } from 'express';
import pgPool from '../db';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  console.log('[AI Planning Auth Debug]', {
    hasSession: !!req.session,
    userId: req.session?.userId,
    sessionId: req.sessionID,
    cookies: req.headers.cookie ? 'YES' : 'NO'
  });
  
  if (!req.session.userId) {
    console.error('[AI Planning Auth Failed] No userId in session');
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

router.use(requireAuth);

interface TransactionData {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  type: string;
}

interface BudgetData {
  category: string;
  limit: number;
  spent: number;
}

interface GoalData {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
}

interface AnalysisResult {
  health_score: number;
  health_grade: string;
  spending_trends: {
    month_avg: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    change_percent: number;
  };
  savings_potential: number;
  at_risk_categories: Array<{
    category: string;
    limit: number;
    spent: number;
    percentage: number;
  }>;
  suggestions: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    potential_savings: number;
    category: string;
  }>;
  goals_progress: Array<{
    name: string;
    progress_percent: number;
    months_to_target: number;
    on_track: boolean;
  }>;
}

router.get('/analyze', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId as string;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const forceRefresh = req.query.refresh === 'true';

    if (!forceRefresh) {
      try {
        const expiresAtNow = new Date().toISOString();
        const cacheResult = await pgPool.query(`
          SELECT analysis_data FROM ai_analysis_cache
          WHERE user_id = ? AND month = ? AND expires_at > ?
        `, [userId, currentMonth, expiresAtNow]);

        if (cacheResult.rows.length > 0) {
          console.log(`[AI Planning] Cache HIT for user ${userId} month ${currentMonth}`);
          return res.json(JSON.parse(cacheResult.rows[0].analysis_data));
        }
      } catch (cacheError) {
        console.warn(`[AI Planning] Cache read failed (table may not exist):`, cacheError);
      }
    }

    const transactionsResult = await pgPool.query(`
      SELECT id, description, amount, date, category, type
      FROM transactions
      WHERE user_id = ?
      ORDER BY date DESC
    `, [userId]);

    const transactions: TransactionData[] = transactionsResult.rows.map(row => ({
      ...row,
      amount: parseFloat(row.amount)
    }));

    if (transactions.length === 0) {
      console.log(`[AI Planning] ⚠️ No transactions found for user ${userId}`);
      return res.json({
        health_score: 0,
        health_grade: 'N/A',
        spending_trends: { month_avg: 0, trend: 'stable' as const, change_percent: 0 },
        savings_potential: 0,
        at_risk_categories: [],
        suggestions: [{ 
          id: 'add-transactions', 
          title: 'Adicione transações', 
          description: 'Para receber análise, adicione suas transações mensais primeiro',
          priority: 'high' as const,
          potential_savings: 0,
          category: 'general'
        }],
        goals_progress: [],
        monthly_comparison: []
      });
    }

    const budgetsResult = await pgPool.query(`
      SELECT DISTINCT category, limit_amount as "limit"
      FROM budget_limits
      WHERE user_id = ?
    `, [userId]);

    const budgets: Array<{ category: string; limit: number }> = budgetsResult.rows.map(row => ({
      category: row.category,
      limit: parseFloat(row.limit)
    }));

    const spendingByCategoryResult = await pgPool.query(`
      SELECT 
        category,
        SUM(CASE WHEN type = 'DESPESA' THEN amount ELSE 0 END) as spent
      FROM transactions
      WHERE user_id = ? AND type = 'DESPESA' AND \`date\` LIKE ?
      GROUP BY category
    `, [userId, `${currentMonth}%`]);

    const spendingByCategory: Array<{ category: string; spent: number }> = spendingByCategoryResult.rows.map(row => ({
      category: row.category,
      spent: parseFloat(row.spent) || 0
    }));

    const spendingMap = new Map(spendingByCategory.map(s => [s.category, s.spent || 0]));

    const budgetData: BudgetData[] = budgets.map(b => ({
      category: b.category,
      limit: b.limit,
      spent: spendingMap.get(b.category) || 0
    }));

    const goalsResult = await pgPool.query(`
      SELECT id, name, target_amount, current_amount, deadline
      FROM savings_goals
      WHERE user_id = ?
    `, [userId]);

    const goals: GoalData[] = goalsResult.rows.map(row => ({
      ...row,
      target_amount: parseFloat(row.target_amount),
      current_amount: parseFloat(row.current_amount)
    }));

    const monthlySpendingResult = await pgPool.query(`
      SELECT 
        LEFT(date, 7) as date,
        SUM(amount) as spent
      FROM transactions
      WHERE user_id = ? AND type = 'DESPESA'
      GROUP BY LEFT(date, 7)
      ORDER BY date DESC
      LIMIT 12
    `, [userId]);

    const monthlySpending: Array<{ date: string; spent: number }> = monthlySpendingResult.rows.map(row => ({
      date: row.date,
      spent: parseFloat(row.spent) || 0
    }));

    const analysis = await calculateAnalysis(transactions, budgetData, goals);
    const fullResponse = {
      ...analysis,
      monthly_comparison: monthlySpending
    };

    const cacheId = `cache_${userId}_${currentMonth}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    
    try {
      await pgPool.query(`
        INSERT INTO ai_analysis_cache (id, user_id, month, analysis_data, expires_at)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          analysis_data = VALUES(analysis_data),
          expires_at = VALUES(expires_at)
      `, [cacheId, userId, currentMonth, JSON.stringify(fullResponse), expiresAt]);
      console.log(`[AI Planning] Cache SAVED for user ${userId} month ${currentMonth}`);
    } catch (cacheError) {
      console.warn(`[AI Planning] Cache write failed (table may not exist):`, cacheError);
    }

    res.json(fullResponse);
  } catch (error) {
    console.error('[AI Planning] Error analyzing:', error);
    res.status(500).json({ 
      error: 'Failed to analyze',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

async function calculateAnalysis(
  transactions: TransactionData[],
  budgets: BudgetData[],
  goals: GoalData[]
): Promise<AnalysisResult> {
  const budgetCompliance = calculateBudgetCompliance(budgets);
  const savingsRate = calculateSavingsRate(transactions);
  const goalProgress = goals.length > 0 
    ? goals.reduce((sum, g) => sum + Math.min((g.current_amount / g.target_amount) * 100, 100), 0) / goals.length
    : 50;

  const health_score = Math.round((budgetCompliance * 0.4 + savingsRate * 0.35 + goalProgress * 0.25));
  const health_grade = getHealthGrade(health_score);

  const monthlySpending = calculateMonthlySpending(transactions);
  const recentMonths = Array.from(monthlySpending.values()).slice(-3);
  const month_avg = recentMonths.reduce((a, b) => a + b, 0) / Math.max(recentMonths.length, 1);
  const prevMonth = recentMonths[recentMonths.length - 2] || month_avg;
  const currentMonth = recentMonths[recentMonths.length - 1] || month_avg;
  const change_percent = prevMonth > 0 ? ((currentMonth - prevMonth) / prevMonth) * 100 : 0;

  const trend = change_percent > 5 ? 'increasing' : change_percent < -5 ? 'decreasing' : 'stable';

  const totalIncome = transactions
    .filter(t => t.type === 'RECEITA')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions
    .filter(t => t.type === 'DESPESA')
    .reduce((sum, t) => sum + t.amount, 0);
  const savings_potential = Math.max(0, totalIncome - totalExpense);

  const at_risk_categories = budgets
    .filter(b => b.limit > 0 && b.spent > b.limit * 0.9)
    .map(b => ({
      category: b.category,
      limit: b.limit,
      spent: b.spent,
      percentage: Math.round((b.spent / b.limit) * 100)
    }))
    .sort((a, b) => b.percentage - a.percentage);

  const suggestions = generateSuggestions(transactions, budgets, health_score);

  const goals_progress = await Promise.all(goals.map(async g => {
    const progress_percent = Math.min(Math.round((g.current_amount / g.target_amount) * 100), 100);
    const monthsRemaining = calculateMonthsRemaining(g.deadline);
    const monthlyNeeded = (g.target_amount - g.current_amount) / Math.max(monthsRemaining, 1);
    const currentMonthlyRate = await calculateMonthlyContribution(g.id);
    const on_track = currentMonthlyRate >= monthlyNeeded;

    return {
      name: g.name,
      progress_percent,
      months_to_target: Math.max(monthsRemaining, 0),
      on_track
    };
  }));

  return {
    health_score,
    health_grade,
    spending_trends: {
      month_avg: Math.round(month_avg),
      trend,
      change_percent: Math.round(change_percent)
    },
    savings_potential: Math.round(savings_potential),
    at_risk_categories,
    suggestions,
    goals_progress
  };
}

function calculateBudgetCompliance(budgets: BudgetData[]): number {
  if (budgets.length === 0) return 75;
  
  const compliant = budgets.filter(b => b.limit === 0 || b.spent <= b.limit).length;
  return (compliant / budgets.length) * 100;
}

function calculateSavingsRate(transactions: TransactionData[]): number {
  const income = transactions
    .filter(t => t.type === 'RECEITA')
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = transactions
    .filter(t => t.type === 'DESPESA')
    .reduce((sum, t) => sum + t.amount, 0);

  if (income === 0) return 0;
  return Math.max(0, Math.min(((income - expense) / income) * 100, 100));
}

function calculateMonthlySpending(transactions: TransactionData[]): Map<string, number> {
  const spending = new Map<string, number>();
  
  transactions.forEach(t => {
    if (t.type === 'DESPESA') {
      const month = t.date.slice(0, 7);
      spending.set(month, (spending.get(month) || 0) + t.amount);
    }
  });

  return spending;
}

function getHealthGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function generateSuggestions(
  transactions: TransactionData[],
  budgets: BudgetData[],
  healthScore: number
): Array<{
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  potential_savings: number;
  category: string;
}> {
  const suggestions: any[] = [];

  budgets.forEach(b => {
    if (b.limit > 0 && b.spent > b.limit * 1.1) {
      suggestions.push({
        id: `s1-${b.category}`,
        title: `Reduzir gastos em ${b.category}`,
        description: `Seus gastos em ${b.category} excedem o orçamento em ${Math.round(((b.spent - b.limit) / b.limit) * 100)}%`,
        priority: 'high' as const,
        potential_savings: Math.round(b.spent - b.limit),
        category: b.category
      });
    }
  });

  if (healthScore < 70) {
    suggestions.push({
      id: 's2-reduce-spending',
      title: 'Aumentar receita ou reduzir despesas',
      description: 'Sua saúde financeira pode ser melhorada equilibrando receita e despesas',
      priority: 'high' as const,
      potential_savings: 500,
      category: 'general'
    });
  }

  const largeTransactions = transactions
    .filter(t => t.type === 'DESPESA')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const avgLargeExpense = largeTransactions.reduce((a, b) => a + b.amount, 0) / Math.max(largeTransactions.length, 1);
  
  if (largeTransactions.length > 0) {
    suggestions.push({
      id: 's3-consolidate',
      title: 'Consolidar despesas recorrentes',
      description: 'Considere agrupar transações similares para melhor controle',
      priority: 'medium' as const,
      potential_savings: Math.round(avgLargeExpense * 0.1),
      category: 'optimization'
    });
  }

  suggestions.push({
    id: 's4-emergency',
    title: 'Criar fundo de emergência',
    description: 'Reserve 3-6 meses de despesas como proteção',
    priority: 'medium' as const,
    potential_savings: 0,
    category: 'savings'
  });

  return suggestions.slice(0, 3);
}

function calculateMonthsRemaining(deadline: string): number {
  const now = new Date();
  const end = new Date(deadline);
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
  return Math.max(months, 0);
}

async function calculateMonthlyContribution(goalId: string): Promise<number> {
  // Calcular data de 1 mês atrás
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const fromDate = oneMonthAgo.toISOString().split('T')[0];

  const result = await pgPool.query(`
    SELECT SUM(amount) as total
    FROM goal_transactions
    WHERE goal_id = ? AND \`date\` >= ?
  `, [goalId, fromDate]);

  return parseFloat(result.rows[0]?.total) || 0;
}

export default router;
