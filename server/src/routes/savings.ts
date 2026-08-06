import { Router } from 'express';
import {
  detectIdleResources,
  detectRICandidates,
  detectRightsizing,
} from '../services/savingsEngine.js';

const router = Router();

// Idle resources
router.get('/idle-resources', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ error: 'month parameter is required' });
    }
    const result = await detectIdleResources(month as string);
    res.json(result);
  } catch (error) {
    console.error('Idle resources error:', error);
    res.status(500).json({ error: 'Failed to detect idle resources' });
  }
});

// Reserved Instance candidates
router.get('/reserved-instances', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ error: 'month parameter is required' });
    }
    const result = await detectRICandidates(month as string);
    res.json(result);
  } catch (error) {
    console.error('RI candidates error:', error);
    res.status(500).json({ error: 'Failed to detect RI candidates' });
  }
});

// Rightsizing suggestions
router.get('/rightsizing', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ error: 'month parameter is required' });
    }
    const result = await detectRightsizing(month as string);
    res.json(result);
  } catch (error) {
    console.error('Rightsizing error:', error);
    res.status(500).json({ error: 'Failed to detect rightsizing opportunities' });
  }
});

export default router;
