import { Router } from 'express';
import { db } from '../db/index.js';
import {
  resourceGroups,
  resourceGroupMembers,
  billLineItems,
} from '../db/schema.js';
import { eq, sql, and, inArray, isNotNull, or } from 'drizzle-orm';

const router = Router();

// List all groups with member count and current month cost
router.get('/', async (req, res) => {
  try {
    const { month } = req.query;

    const allGroups = await db
      .select()
      .from(resourceGroups)
      .orderBy(resourceGroups.createdAt);

    const groupsWithDetails = await Promise.all(
      allGroups.map(async (group) => {
        // Get members
        const members = await db
          .select()
          .from(resourceGroupMembers)
          .where(eq(resourceGroupMembers.groupId, group.id));

        // Calculate current month cost
        let currentCost = 0;
        if (month && members.length > 0) {
          const memberNames = members.map((m) => m.resourceName);
          const [costResult] = await db
            .select({
              amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
            })
            .from(billLineItems)
            .where(
              and(
                sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`,
                or(
                  inArray(billLineItems.instanceId, memberNames),
                  inArray(billLineItems.resourceName, memberNames)
                )
              )
            );
          currentCost = Number(costResult?.amount || 0);
        }

        return {
          ...group,
          memberCount: members.length,
          currentCost,
        };
      })
    );

    res.json(groupsWithDetails);
  } catch (error) {
    console.error('List groups error:', error);
    res.status(500).json({ error: 'Failed to list resource groups' });
  }
});

// Create a group
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const [group] = await db
      .insert(resourceGroups)
      .values({ name, color: color || '#3B82F6' })
      .returning();

    res.json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create resource group' });
  }
});

// Update a group
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const [group] = await db
      .update(resourceGroups)
      .set({ name, color })
      .where(eq(resourceGroups.id, id))
      .returning();

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json(group);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Failed to update resource group' });
  }
});

// Delete a group and its members
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db
      .delete(resourceGroupMembers)
      .where(eq(resourceGroupMembers.groupId, id));
    await db.delete(resourceGroups).where(eq(resourceGroups.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete resource group' });
  }
});

// Get members of a group with their costs
router.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { month } = req.query;

    const members = await db
      .select()
      .from(resourceGroupMembers)
      .where(eq(resourceGroupMembers.groupId, id));

    // Get cost for each member
    const membersWithCosts = await Promise.all(
      members.map(async (member) => {
        let cost = 0;
        const conditions = [
          or(
            eq(billLineItems.instanceId, member.resourceName),
            eq(billLineItems.resourceName, member.resourceName)
          )!,
        ];
        if (month) {
          conditions.push(
            sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`
          );
        }

        const [result] = await db
          .select({
            amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
          })
          .from(billLineItems)
          .where(and(...conditions));

        cost = Number(result?.amount || 0);

        return {
          ...member,
          cost,
        };
      })
    );

    res.json(membersWithCosts);
  } catch (error) {
    console.error('List members error:', error);
    res.status(500).json({ error: 'Failed to list group members' });
  }
});

// Add resources to a group (batch)
router.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { resources } = req.body;

    if (!Array.isArray(resources) || resources.length === 0) {
      return res.status(400).json({ error: 'resources array is required' });
    }

    // Get existing members to avoid duplicates
    const existing = await db
      .select({ resourceName: resourceGroupMembers.resourceName })
      .from(resourceGroupMembers)
      .where(eq(resourceGroupMembers.groupId, id));

    const existingNames = new Set(existing.map((e) => e.resourceName));
    const newResources = resources.filter(
      (r: string) => !existingNames.has(r)
    );

    if (newResources.length > 0) {
      await db.insert(resourceGroupMembers).values(
        newResources.map((r: string) => ({
          groupId: id,
          resourceName: r,
        }))
      );
    }

    // Return updated member list
    const members = await db
      .select()
      .from(resourceGroupMembers)
      .where(eq(resourceGroupMembers.groupId, id));

    res.json({ added: newResources.length, members });
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ error: 'Failed to add members' });
  }
});

// Remove a member from a group
router.delete('/:id/members/:memberId', async (req, res) => {
  try {
    const { memberId } = req.params;
    await db
      .delete(resourceGroupMembers)
      .where(eq(resourceGroupMembers.id, memberId));
    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Get all groups' costs for a given month
router.get('/costs', async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ error: 'month is required' });
    }

    const allGroups = await db.select().from(resourceGroups);

    const costs = await Promise.all(
      allGroups.map(async (group) => {
        const members = await db
          .select({ resourceName: resourceGroupMembers.resourceName })
          .from(resourceGroupMembers)
          .where(eq(resourceGroupMembers.groupId, group.id));

        if (members.length === 0) {
          return { groupId: group.id, name: group.name, color: group.color, amount: 0 };
        }

        const memberNames = members.map((m) => m.resourceName);
        const [result] = await db
          .select({
            amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
          })
          .from(billLineItems)
          .where(
            and(
              sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`,
              or(
                inArray(billLineItems.instanceId, memberNames),
                inArray(billLineItems.resourceName, memberNames)
              )
            )
          );

        return {
          groupId: group.id,
          name: group.name,
          color: group.color,
          amount: Number(result?.amount || 0),
        };
      })
    );

    res.json(costs);
  } catch (error) {
    console.error('Group costs error:', error);
    res.status(500).json({ error: 'Failed to get group costs' });
  }
});

// Get all groups' cost trends across months
router.get('/costs/trend', async (req, res) => {
  try {
    const allGroups = await db.select().from(resourceGroups);
    const allMembers = await db.select().from(resourceGroupMembers);

    // Build a map of group -> member names
    const groupMembers = new Map<string, string[]>();
    for (const member of allMembers) {
      const existing = groupMembers.get(member.groupId) || [];
      existing.push(member.resourceName);
      groupMembers.set(member.groupId, existing);
    }

    // Get all available months from bills
    const monthsResult = await db
      .select({ month: sql<string>`to_char(${billLineItems.billingDate}::date, 'YYYY-MM')` })
      .from(billLineItems)
      .where(isNotNull(billLineItems.billingDate))
      .groupBy(sql`to_char(${billLineItems.billingDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${billLineItems.billingDate}::date, 'YYYY-MM')`);

    const months = monthsResult.map((r) => r.month);

    // For each group, get cost per month
    const trends = await Promise.all(
      allGroups.map(async (group) => {
        const memberNames = groupMembers.get(group.id) || [];

        if (memberNames.length === 0) {
          return {
            groupId: group.id,
            name: group.name,
            color: group.color,
            trend: months.map((m) => ({ period: m, amount: 0 })),
          };
        }

        const periodCol = sql<string>`to_char(${billLineItems.billingDate}::date, 'YYYY-MM')`;

        const result = await db
          .select({
            period: periodCol,
            amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
          })
          .from(billLineItems)
          .where(
            and(
              isNotNull(billLineItems.billingDate),
              or(
                inArray(billLineItems.instanceId, memberNames),
                inArray(billLineItems.resourceName, memberNames)
              )
            )
          )
          .groupBy(periodCol)
          .orderBy(periodCol);

        // Fill in missing months with 0
        const costMap = new Map(result.map((r) => [r.period, Number(r.amount)]));

        return {
          groupId: group.id,
          name: group.name,
          color: group.color,
          trend: months.map((m) => ({
            period: m,
            amount: costMap.get(m) || 0,
          })),
        };
      })
    );

    res.json(trends);
  } catch (error) {
    console.error('Group trend error:', error);
    res.status(500).json({ error: 'Failed to get group cost trends' });
  }
});

export default router;
