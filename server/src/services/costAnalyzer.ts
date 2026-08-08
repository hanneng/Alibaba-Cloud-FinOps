import { db } from '../db/index.js';
import { billLineItems, bills } from '../db/schema.js';
import { eq, sql, and, gte, lte, isNotNull, or, ilike } from 'drizzle-orm';
import type {
  CostTrend,
  CostByDimension,
  TopResource,
} from '../types.js';

/**
 * Get cost trend over time.
 */
export async function getCostTrend(
  from?: string,
  to?: string,
  granularity: 'month' | 'day' = 'month'
): Promise<CostTrend[]> {
  let conditions = [isNotNull(billLineItems.billingDate)];

  if (from) {
    conditions.push(gte(billLineItems.billingDate, from));
  }
  if (to) {
    conditions.push(lte(billLineItems.billingDate, to));
  }

  // Use hardcoded format string (no parameterization) so SELECT/GROUP BY match
  const periodCol = granularity === 'day'
    ? sql<string>`to_char(${billLineItems.billingDate}::date, 'YYYY-MM-DD')`
    : sql<string>`to_char(${billLineItems.billingDate}::date, 'YYYY-MM')`;

  const result = await db
    .select({
      period: periodCol,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(and(...conditions))
    .groupBy(periodCol)
    .orderBy(periodCol);

  return result.map((r) => ({
    period: r.period,
    amount: Number(r.amount),
  }));
}

/**
 * Get cost breakdown by service/product.
 */
export async function getCostByService(
  month?: string
): Promise<CostByDimension[]> {
  const conditions = [isNotNull(billLineItems.productName)];
  if (month) {
    conditions.push(
      sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`
    );
  }

  const result = await db
    .select({
      name: billLineItems.productName,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(and(...conditions))
    .groupBy(billLineItems.productName)
    .orderBy(sql`SUM(${billLineItems.pretaxAmount}::numeric) DESC`);

  const total = result.reduce((sum, r) => sum + Number(r.amount), 0);

  return result.map((r) => ({
    name: r.name || 'Unknown',
    amount: Number(r.amount),
    percentage: total > 0 ? (Number(r.amount) / total) * 100 : 0,
  }));
}

/**
 * Get cost breakdown by region.
 */
export async function getCostByRegion(
  month?: string
): Promise<CostByDimension[]> {
  const conditions = [isNotNull(billLineItems.region)];
  if (month) {
    conditions.push(
      sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`
    );
  }

  const result = await db
    .select({
      name: billLineItems.region,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(and(...conditions))
    .groupBy(billLineItems.region)
    .orderBy(sql`SUM(${billLineItems.pretaxAmount}::numeric) DESC`);

  const total = result.reduce((sum, r) => sum + Number(r.amount), 0);

  return result.map((r) => ({
    name: r.name || 'Unknown',
    amount: Number(r.amount),
    percentage: total > 0 ? (Number(r.amount) / total) * 100 : 0,
  }));
}

/**
 * Get top N most expensive resources.
 */
export async function getTopResources(
  month?: string,
  limit: number = 20
): Promise<TopResource[]> {
  const conditions: ReturnType<typeof isNotNull>[] = [];
  if (month) {
    conditions.push(
      sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`
    );
  }

  const result = await db
    .select({
      instanceId: billLineItems.instanceId,
      resourceName: billLineItems.resourceName,
      productName: billLineItems.productName,
      productCode: billLineItems.productCode,
      region: billLineItems.region,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(and(...conditions))
    .groupBy(
      billLineItems.instanceId,
      billLineItems.resourceName,
      billLineItems.productName,
      billLineItems.productCode,
      billLineItems.region
    )
    .orderBy(sql`SUM(${billLineItems.pretaxAmount}::numeric) DESC`)
    .limit(limit);

  return result.map((r) => ({
    instanceId: r.instanceId,
    resourceName: r.resourceName,
    productName: r.productName || 'Unknown',
    productCode: r.productCode,
    region: r.region,
    amount: Number(r.amount),
  }));
}

/**
 * Compare costs between two months.
 */
export async function compareCosts(month1: string, month2: string) {
  const [services1, services2] = await Promise.all([
    getCostByService(month1),
    getCostByService(month2),
  ]);

  const total1 = services1.reduce((s, r) => s + r.amount, 0);
  const total2 = services2.reduce((s, r) => s + r.amount, 0);

  // Build comparison map
  const serviceMap = new Map<string, { name: string; m1: number; m2: number; change: number; changePct: number }>();

  for (const s of services1) {
    serviceMap.set(s.name, {
      name: s.name,
      m1: s.amount,
      m2: 0,
      change: 0,
      changePct: 0,
    });
  }
  for (const s of services2) {
    const existing = serviceMap.get(s.name);
    if (existing) {
      existing.m2 = s.amount;
      existing.change = s.amount - existing.m1;
      existing.changePct =
        existing.m1 > 0 ? ((s.amount - existing.m1) / existing.m1) * 100 : 100;
    } else {
      serviceMap.set(s.name, {
        name: s.name,
        m1: 0,
        m2: s.amount,
        change: s.amount,
        changePct: 100,
      });
    }
  }

  return {
    month1,
    month2,
    totalMonth1: total1,
    totalMonth2: total2,
    totalChange: total2 - total1,
    totalChangePct: total1 > 0 ? ((total2 - total1) / total1) * 100 : 100,
    services: Array.from(serviceMap.values()).sort(
      (a, b) => Math.abs(b.change) - Math.abs(a.change)
    ),
  };
}

/**
 * Get all available billing months.
 */
export async function getAvailableMonths(): Promise<string[]> {
  const result = await db
    .select({ month: bills.billingMonth })
    .from(bills)
    .orderBy(bills.billingMonth);

  return [...new Set(result.map((r) => r.billingMonth))];
}

/**
 * Get subscription type breakdown for a month.
 */
export async function getCostBySubscriptionType(month?: string): Promise<CostByDimension[]> {
  const conditions = [isNotNull(billLineItems.subscriptionType)];
  if (month) {
    conditions.push(
      sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`
    );
  }

  const result = await db
    .select({
      name: billLineItems.subscriptionType,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(and(...conditions))
    .groupBy(billLineItems.subscriptionType)
    .orderBy(sql`SUM(${billLineItems.pretaxAmount}::numeric) DESC`);

  const total = result.reduce((sum, r) => sum + Number(r.amount), 0);

  return result.map((r) => ({
    name: r.name || 'Unknown',
    amount: Number(r.amount),
    percentage: total > 0 ? (Number(r.amount) / total) * 100 : 0,
  }));
}

/**
 * Search unique resources by name/ID pattern.
 */
export async function getResources(query?: string) {
  const conditions: ReturnType<typeof isNotNull>[] = [
    or(
      isNotNull(billLineItems.instanceId),
      isNotNull(billLineItems.resourceName)
    )!,
  ];

  if (query && query.trim()) {
    const q = `%${query.trim()}%`;
    conditions.push(
      or(
        ilike(billLineItems.instanceId, q),
        ilike(billLineItems.resourceName, q)
      )!
    );
  }

  const result = await db
    .select({
      instanceId: billLineItems.instanceId,
      resourceName: billLineItems.resourceName,
      productName: billLineItems.productName,
      totalCost: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(and(...conditions))
    .groupBy(
      billLineItems.instanceId,
      billLineItems.resourceName,
      billLineItems.productName
    )
    .orderBy(sql`SUM(${billLineItems.pretaxAmount}::numeric) DESC`)
    .limit(100);

  return result.map((r) => ({
    instanceId: r.instanceId,
    resourceName: r.resourceName,
    productName: r.productName || 'Unknown',
    totalCost: Number(r.totalCost),
  }));
}

/**
 * Get monthly cost history for a specific resource (by instanceId).
 */
export async function getResourceCostHistory(instanceId: string) {
  const periodCol = sql<string>`to_char(${billLineItems.billingDate}::date, 'YYYY-MM')`;

  const result = await db
    .select({
      period: periodCol,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(
      and(
        or(
          eq(billLineItems.instanceId, instanceId),
          eq(billLineItems.resourceName, instanceId)
        )!,
        isNotNull(billLineItems.billingDate)
      )
    )
    .groupBy(periodCol)
    .orderBy(periodCol);

  return result.map((r) => ({
    period: r.period,
    amount: Number(r.amount),
  }));
}

/**
 * Get cost breakdown by service for a specific resource.
 */
export async function getResourceCostByService(
  instanceId: string,
  month?: string
): Promise<CostByDimension[]> {
  const conditions = [
    or(
      eq(billLineItems.instanceId, instanceId),
      eq(billLineItems.resourceName, instanceId)
    )!,
    isNotNull(billLineItems.productName),
  ];

  if (month) {
    conditions.push(
      sql`to_char(${billLineItems.billingDate}, 'YYYY-MM') = ${month}`
    );
  }

  const result = await db
    .select({
      name: billLineItems.productName,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(and(...conditions))
    .groupBy(billLineItems.productName)
    .orderBy(sql`SUM(${billLineItems.pretaxAmount}::numeric) DESC`);

  const total = result.reduce((sum, r) => sum + Number(r.amount), 0);

  return result.map((r) => ({
    name: r.name || 'Unknown',
    amount: Number(r.amount),
    percentage: total > 0 ? (Number(r.amount) / total) * 100 : 0,
  }));
}
