import { Router } from 'express';
import {
  getCostTrend,
  getCostByService,
  getCostByRegion,
  getTopResources,
  compareCosts,
  getAvailableMonths,
  getCostBySubscriptionType,
} from '../services/costAnalyzer.js';

const router = Router();

// Cost trend over time
router.get('/trend', async (req, res) => {
  try {
    const { from, to, granularity } = req.query;
    const result = await getCostTrend(
      from as string,
      to as string,
      (granularity as 'month' | 'day') || 'month'
    );
    res.json(result);
  } catch (error) {
    console.error('Cost trend error:', error);
    res.status(500).json({ error: 'Failed to get cost trend' });
  }
});

// Cost by service/product
router.get('/by-service', async (req, res) => {
  try {
    const { month } = req.query;
    const result = await getCostByService(month as string);
    res.json(result);
  } catch (error) {
    console.error('Cost by service error:', error);
    res.status(500).json({ error: 'Failed to get cost by service' });
  }
});

// Cost by region
router.get('/by-region', async (req, res) => {
  try {
    const { month } = req.query;
    const result = await getCostByRegion(month as string);
    res.json(result);
  } catch (error) {
    console.error('Cost by region error:', error);
    res.status(500).json({ error: 'Failed to get cost by region' });
  }
});

// Cost by subscription type
router.get('/by-subscription-type', async (req, res) => {
  try {
    const { month } = req.query;
    const result = await getCostBySubscriptionType(month as string);
    res.json(result);
  } catch (error) {
    console.error('Cost by subscription type error:', error);
    res.status(500).json({ error: 'Failed to get cost by subscription type' });
  }
});

// Top resources by cost
router.get('/top-resources', async (req, res) => {
  try {
    const { month, limit } = req.query;
    const result = await getTopResources(
      month as string,
      limit ? parseInt(limit as string, 10) : 20
    );
    res.json(result);
  } catch (error) {
    console.error('Top resources error:', error);
    res.status(500).json({ error: 'Failed to get top resources' });
  }
});

// Month-over-month comparison
router.get('/compare', async (req, res) => {
  try {
    const { month1, month2 } = req.query;
    if (!month1 || !month2) {
      return res.status(400).json({ error: 'month1 and month2 are required' });
    }
    const result = await compareCosts(month1 as string, month2 as string);
    res.json(result);
  } catch (error) {
    console.error('Compare costs error:', error);
    res.status(500).json({ error: 'Failed to compare costs' });
  }
});

// Available billing months
router.get('/months', async (_req, res) => {
  try {
    const months = await getAvailableMonths();
    res.json(months);
  } catch (error) {
    console.error('Available months error:', error);
    res.status(500).json({ error: 'Failed to get available months' });
  }
});

export default router;
