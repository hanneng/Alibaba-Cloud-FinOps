import { Router } from 'express';
import { detectAnomalies } from '../services/anomalyDetector.js';
import { db } from '../db/index.js';
import { anomalyRules } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// Detect anomalies for a month
router.get('/', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ error: 'month parameter is required' });
    }
    const anomalies = await detectAnomalies(month as string);
    res.json(anomalies);
  } catch (error) {
    console.error('Anomaly detection error:', error);
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

// List anomaly rules
router.get('/rules', async (_req, res) => {
  try {
    const rules = await db.select().from(anomalyRules);
    res.json(rules);
  } catch (error) {
    console.error('List rules error:', error);
    res.status(500).json({ error: 'Failed to list rules' });
  }
});

// Create anomaly rule
router.post('/rules', async (req, res) => {
  try {
    const { productCode, thresholdPct, comparisonMode } = req.body;
    const [rule] = await db
      .insert(anomalyRules)
      .values({
        productCode: productCode || null,
        thresholdPct: String(thresholdPct || '30.00'),
        comparisonMode: comparisonMode || 'month_over_month',
      })
      .returning();
    res.json(rule);
  } catch (error) {
    console.error('Create rule error:', error);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// Update anomaly rule
router.put('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { productCode, thresholdPct, comparisonMode } = req.body;
    const [rule] = await db
      .update(anomalyRules)
      .set({
        productCode: productCode || null,
        thresholdPct: String(thresholdPct),
        comparisonMode,
      })
      .where(eq(anomalyRules.id, id))
      .returning();
    res.json(rule);
  } catch (error) {
    console.error('Update rule error:', error);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// Delete anomaly rule
router.delete('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(anomalyRules).where(eq(anomalyRules.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete rule error:', error);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

export default router;
