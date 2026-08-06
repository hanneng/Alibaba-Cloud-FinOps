import { Router } from 'express';
import { db } from '../db/index.js';
import { budgetAllocations, costTags, billLineItems } from '../db/schema.js';
import { eq, sql, and, isNotNull } from 'drizzle-orm';

const router = Router();

// List all budgets with current spend
router.get('/', async (req, res) => {
  try {
    const { month } = req.query;
    const allBudgets = await db.select().from(budgetAllocations);

    const budgetsData = await Promise.all(
      allBudgets.map(async (budget) => {
        // Get tags associated with this budget
        const tags = await db
          .select()
          .from(costTags)
          .where(eq(costTags.budgetId, budget.id));

        // Calculate current spend based on tag rules
        let currentSpend = 0;
        if (month && tags.length > 0) {
          // Build OR conditions for tag matching
          const tagConditions = tags.map((tag) =>
            sql`${billLineItems.tags}::text LIKE ${'%' + tag.key + ':' + tag.value + '%'}`
          );

          const result = await db
            .select({
              amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
            })
            .from(billLineItems)
            .where(
              and(
                sql`${billLineItems.billingDate} LIKE ${month + '%'}`,
                sql.join(tagConditions, sql` OR `)
              )
            );

          currentSpend = Number(result[0]?.amount || 0);
        }

        return {
          ...budget,
          tags,
          currentSpend,
          utilizationPct:
            parseFloat(budget.monthlyLimit) > 0
              ? (currentSpend / parseFloat(budget.monthlyLimit)) * 100
              : 0,
        };
      })
    );

    res.json(budgetsData);
  } catch (error) {
    console.error('List budgets error:', error);
    res.status(500).json({ error: 'Failed to list budgets' });
  }
});

// Create budget
router.post('/', async (req, res) => {
  try {
    const { name, monthlyLimit, tagRules, color } = req.body;
    const [budget] = await db
      .insert(budgetAllocations)
      .values({
        name,
        monthlyLimit: String(monthlyLimit),
        tagRules: tagRules || [],
        color: color || '#3B82F6',
      })
      .returning();

    // Create cost tags for this budget
    if (tagRules && Array.isArray(tagRules)) {
      for (const rule of tagRules) {
        await db.insert(costTags).values({
          key: rule.key,
          value: rule.value,
          budgetId: budget.id,
        });
      }
    }

    res.json(budget);
  } catch (error) {
    console.error('Create budget error:', error);
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

// Update budget
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, monthlyLimit, tagRules, color } = req.body;

    const [budget] = await db
      .update(budgetAllocations)
      .set({
        name,
        monthlyLimit: String(monthlyLimit),
        tagRules: tagRules || [],
        color,
      })
      .where(eq(budgetAllocations.id, id))
      .returning();

    // Update cost tags
    if (tagRules && Array.isArray(tagRules)) {
      await db.delete(costTags).where(eq(costTags.budgetId, id));
      for (const rule of tagRules) {
        await db.insert(costTags).values({
          key: rule.key,
          value: rule.value,
          budgetId: id,
        });
      }
    }

    res.json(budget);
  } catch (error) {
    console.error('Update budget error:', error);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// Delete budget
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(costTags).where(eq(costTags.budgetId, id));
    await db.delete(budgetAllocations).where(eq(budgetAllocations.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete budget error:', error);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

// Tag summary
router.get('/tags/summary', async (req, res) => {
  try {
    const { month } = req.query;
    // Get unique tag keys from line items
    const result = await db
      .select({
        tags: billLineItems.tags,
        amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
      })
      .from(billLineItems)
      .where(
        and(
          isNotNull(billLineItems.tags),
          month ? sql`${billLineItems.billingDate} LIKE ${month + '%'}` : sql`true`
        )
      )
      .groupBy(billLineItems.tags);

    // Aggregate by tag key:value
    const tagSummary = new Map<string, number>();
    for (const row of result) {
      if (row.tags && typeof row.tags === 'object') {
        for (const [key, value] of Object.entries(row.tags as Record<string, string>)) {
          const tagKey = `${key}:${value}`;
          tagSummary.set(tagKey, (tagSummary.get(tagKey) || 0) + Number(row.amount));
        }
      }
    }

    res.json(
      Array.from(tagSummary.entries()).map(([tag, amount]) => ({
        tag,
        amount,
      }))
    );
  } catch (error) {
    console.error('Tag summary error:', error);
    res.status(500).json({ error: 'Failed to get tag summary' });
  }
});

export default router;
