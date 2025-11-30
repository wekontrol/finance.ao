import { Router, Request, Response } from 'express';
import pgPool from '../db';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

router.use(requireAuth);

router.post('/subscribe', async (req: Request, res: Response) => {
  const userId = req.session!.userId as string;
  const { subscription } = req.body;

  if (!subscription) {
    return res.status(400).json({ error: 'Subscription required' });
  }

  try {
    const id = `ps${Date.now()}`;
    const subscriptionJson = JSON.stringify(subscription);
    
    await pgPool.query(`
      INSERT INTO push_subscriptions (id, user_id, subscription, user_agent)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE last_active = CURRENT_TIMESTAMP
    `, [id, userId, subscriptionJson, req.headers['user-agent'] || '']);

    res.json({ message: 'Subscribed to push notifications' });
  } catch (error: any) {
    console.error('Error subscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/unsubscribe', async (req: Request, res: Response) => {
  const userId = req.session!.userId as string;
  const { subscription } = req.body;

  if (!subscription) {
    return res.status(400).json({ error: 'Subscription required' });
  }

  try {
    const subscriptionJson = JSON.stringify(subscription);
    await pgPool.query(`
      DELETE FROM push_subscriptions WHERE user_id = ? AND subscription = ?
    `, [userId, subscriptionJson]);

    res.json({ message: 'Unsubscribed from push notifications' });
  } catch (error: any) {
    console.error('Error unsubscribing:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  const userId = req.session!.userId as string;

  try {
    const result = await pgPool.query(`
      SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = ?
    `, [userId]);
    const count = result.rows[0];

    res.json({ 
      isSubscribed: parseInt(count.count) > 0,
      subscriptionCount: parseInt(count.count)
    });
  } catch (error: any) {
    console.error('Error checking status:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/test', (req: Request, res: Response) => {
  const user = req.session!.user as any;
  
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin only' });
  }

  res.json({ message: 'Test notification triggered (não implementado completamente)' });
});

export default router;
