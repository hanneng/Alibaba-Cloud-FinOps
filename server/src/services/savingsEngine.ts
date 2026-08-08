import { db } from '../db/index.js';
import { billLineItems } from '../db/schema.js';
import { sql, and, isNotNull } from 'drizzle-orm';
import type { SavingsItem } from '../types.js';

/**
 * Detect potentially idle resources for a given month.
 * Resources with cost but very low usage indicate idle/unused resources.
 */
export async function detectIdleResources(month: string): Promise<SavingsItem[]> {
  const result = await db
    .select({
      productName: billLineItems.productName,
      productCode: billLineItems.productCode,
      instanceId: billLineItems.instanceId,
      region: billLineItems.region,
      usage: sql<number>`COALESCE(SUM(${billLineItems.usage}::numeric), 0)`,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
      unit: billLineItems.unit,
    })
    .from(billLineItems)
    .where(
      and(
        isNotNull(billLineItems.instanceId),
        sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`
      )
    )
    .groupBy(
      billLineItems.productName,
      billLineItems.productCode,
      billLineItems.instanceId,
      billLineItems.region,
      billLineItems.unit
    )
    .having(sql`SUM(${billLineItems.pretaxAmount}::numeric) > 10`);

  const idle: SavingsItem[] = [];

  for (const row of result) {
    const usage = Number(row.usage);
    const amount = Number(row.amount);

    // Flag resources with cost but near-zero usage
    // ECS instances with <100 hours (should be ~720 for full month)
    // EIPs, disks, snapshots with cost but 0 usage
    const productCode = (row.productCode || '').toLowerCase();
    const isCompute = ['ecs', 'eip', 'slb'].some((p) => productCode.includes(p));

    if (usage === 0 && amount > 0) {
      idle.push({
        type: 'idle',
        productName: row.productName || 'Unknown',
        productCode: row.productCode,
        instanceId: row.instanceId,
        region: row.region,
        currentCost: amount,
        estimatedSavings: amount, // Full savings if deleted
        recommendation: `Resource ${row.instanceId} has zero usage but costs ${amount.toFixed(2)}. Consider releasing this resource if not needed.`,
      });
    } else if (isCompute && usage < 100 && amount > 50) {
      // Compute resources running less than 100 hours out of ~720
      const utilizationPct = (usage / 720) * 100;
      idle.push({
        type: 'idle',
        productName: row.productName || 'Unknown',
        productCode: row.productCode,
        instanceId: row.instanceId,
        region: row.region,
        currentCost: amount,
        estimatedSavings: amount * (1 - utilizationPct / 100),
        recommendation: `Instance ${row.instanceId} ran for only ${usage.toFixed(0)}h (~${utilizationPct.toFixed(0)}% of the month). Consider scheduling or stopping when not in use.`,
      });
    }
  }

  return idle.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
}

/**
 * Detect Pay-As-You-Go resources that could benefit from Reserved Instances.
 * Resources running full month on PAYG are good RI candidates.
 */
export async function detectRICandidates(month: string): Promise<SavingsItem[]> {
  const result = await db
    .select({
      productName: billLineItems.productName,
      productCode: billLineItems.productCode,
      instanceId: billLineItems.instanceId,
      region: billLineItems.region,
      subscriptionType: billLineItems.subscriptionType,
      usage: sql<number>`COALESCE(SUM(${billLineItems.usage}::numeric), 0)`,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(
      and(
        isNotNull(billLineItems.instanceId),
        sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`
      )
    )
    .groupBy(
      billLineItems.productName,
      billLineItems.productCode,
      billLineItems.instanceId,
      billLineItems.region,
      billLineItems.subscriptionType
    )
    .having(sql`SUM(${billLineItems.pretaxAmount}::numeric) > 100`);

  const candidates: SavingsItem[] = [];

  for (const row of result) {
    const subType = (row.subscriptionType || '').toLowerCase();
    const isPayg =
      subType.includes('pay') || subType.includes('按量') || subType.includes('postpaid');

    if (!isPayg) continue;

    const usage = Number(row.usage);
    const amount = Number(row.amount);

    // Check if resource ran close to full month (>=600 hours or high usage)
    if (usage >= 600) {
      // RI typically saves 30-60% vs PAYG
      const savingsPct = 0.4; // Assume 40% savings
      candidates.push({
        type: 'reserved_instance',
        productName: row.productName || 'Unknown',
        productCode: row.productCode,
        instanceId: row.instanceId,
        region: row.region,
        currentCost: amount,
        estimatedSavings: amount * savingsPct,
        recommendation: `Instance ${row.instanceId} runs 24/7 on Pay-As-You-Go (${amount.toFixed(2)}/month). A 1-year Reserved Instance could save ~${(amount * savingsPct).toFixed(2)}/month.`,
      });
    }
  }

  return candidates.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
}

/**
 * Detect resources that may be oversized for their workload.
 * Uses billing item details and cost patterns to suggest rightsizing.
 */
export async function detectRightsizing(month: string): Promise<SavingsItem[]> {
  // Look for resources with high per-unit costs
  const result = await db
    .select({
      productName: billLineItems.productName,
      productCode: billLineItems.productCode,
      instanceId: billLineItems.instanceId,
      region: billLineItems.region,
      billingItem: billLineItems.billingItem,
      usage: sql<number>`COALESCE(SUM(${billLineItems.usage}::numeric), 0)`,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(
      and(
        isNotNull(billLineItems.instanceId),
        isNotNull(billLineItems.billingItem),
        sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`
      )
    )
    .groupBy(
      billLineItems.productName,
      billLineItems.productCode,
      billLineItems.instanceId,
      billLineItems.region,
      billLineItems.billingItem
    )
    .having(sql`SUM(${billLineItems.pretaxAmount}::numeric) > 200`);

  const suggestions: SavingsItem[] = [];
  const seenInstances = new Set<string>();

  for (const row of result) {
    const instanceId = row.instanceId || '';
    if (seenInstances.has(instanceId)) continue;
    seenInstances.add(instanceId);

    const amount = Number(row.amount);
    const usage = Number(row.usage);
    const unitCost = usage > 0 ? amount / usage : amount;

    // Flag if the billing item suggests high-spec resources
    const billingItem = (row.billingItem || '').toLowerCase();
    const isHighSpec =
      billingItem.includes('large') ||
      billingItem.includes('xlarge') ||
      billingItem.includes('2xlarge') ||
      billingItem.includes('4xlarge') ||
      billingItem.includes('8xlarge') ||
      billingItem.includes('high') ||
      billingItem.includes('premium');

    if (isHighSpec && amount > 500) {
      suggestions.push({
        type: 'rightsizing',
        productName: row.productName || 'Unknown',
        productCode: row.productCode,
        instanceId: row.instanceId,
        region: row.region,
        currentCost: amount,
        estimatedSavings: amount * 0.3, // Assume 30% savings from downsizing
        recommendation: `Instance ${row.instanceId} uses high-spec configuration (${row.billingItem}). Consider monitoring actual resource utilization and downsizing if consistently under 50% usage.`,
      });
    }
  }

  return suggestions.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
}
