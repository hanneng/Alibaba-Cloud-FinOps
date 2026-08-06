import { db } from '../db/index.js';
import { billLineItems, bills, anomalyRules } from '../db/schema.js';
import { sql, and, isNotNull } from 'drizzle-orm';
import type { Anomaly } from '../types.js';

/**
 * Detect cost anomalies for a given month.
 * Compares against previous month and rolling average.
 */
export async function detectAnomalies(month: string): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];

  // Get all available months before the target month
  const allMonths = await db
    .select({ month: bills.billingMonth })
    .from(bills)
    .orderBy(bills.billingMonth);

  const uniqueMonths = [...new Set(allMonths.map((m) => m.billingMonth))];
  const monthIndex = uniqueMonths.indexOf(month);

  if (monthIndex < 0) return anomalies;

  const prevMonth = monthIndex > 0 ? uniqueMonths[monthIndex - 1] : null;
  const monthsForAvg = uniqueMonths.slice(Math.max(0, monthIndex - 3), monthIndex);

  // Get current month costs by product
  const currentCosts = await getProductCosts(month);

  // Get previous month costs by product
  const prevCosts = prevMonth ? await getProductCosts(prevMonth) : new Map();

  // Get rolling average costs
  const avgCosts = new Map<string, { avg: number; stdDev: number }>();
  if (monthsForAvg.length > 0) {
    const historicalCosts = await Promise.all(
      monthsForAvg.map((m) => getProductCosts(m))
    );

    // Calculate rolling average and standard deviation per product
    const allProducts = new Set<string>();
    for (const costMap of historicalCosts) {
      for (const product of costMap.keys()) {
        allProducts.add(product);
      }
    }

    for (const product of allProducts) {
      const values = historicalCosts.map(
        (m) => m.get(product) || 0
      );
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      const variance =
        values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      avgCosts.set(product, { avg, stdDev });
    }
  }

  // Get custom rules
  const rules = await db.select().from(anomalyRules);
  const defaultThreshold = 30; // default 30%

  // Check each product for anomalies
  for (const [productCode, currentAmount] of currentCosts) {
    const productName = productCode; // We'll enhance with actual names later
    const prevAmount = prevCosts.get(productCode) || 0;
    const avgData = avgCosts.get(productCode);

    // Find applicable rule
    const rule = rules.find(
      (r) => r.productCode === productCode || r.productCode === null
    );
    const threshold = rule
      ? parseFloat(rule.thresholdPct)
      : defaultThreshold;
    const mode = rule?.comparisonMode || 'month_over_month';

    // Month-over-month check
    if (mode === 'month_over_month' && prevMonth && prevAmount > 0) {
      const changePct = ((currentAmount - prevAmount) / prevAmount) * 100;
      if (Math.abs(changePct) >= threshold) {
        anomalies.push({
          type: 'month_over_month',
          productName,
          productCode,
          currentAmount,
          previousAmount: prevAmount,
          changePct: Math.round(changePct * 100) / 100,
          severity: Math.abs(changePct) >= threshold * 2 ? 'high' : 'medium',
          explanation: `${productName} cost changed by ${changePct.toFixed(1)}% month-over-month (${prevAmount.toFixed(2)} -> ${currentAmount.toFixed(2)})`,
        });
      }
    }

    // Rolling average check
    if (mode === 'rolling_avg' && avgData && avgData.avg > 0) {
      const deviation = currentAmount - avgData.avg;
      const zScore = avgData.stdDev > 0 ? deviation / avgData.stdDev : 0;

      if (Math.abs(zScore) >= 2) {
        anomalies.push({
          type: 'rolling_avg',
          productName,
          productCode,
          currentAmount,
          previousAmount: avgData.avg,
          changePct: Math.round(((currentAmount - avgData.avg) / avgData.avg) * 10000) / 100,
          severity: Math.abs(zScore) >= 3 ? 'high' : 'medium',
          explanation: `${productName} cost is ${Math.abs(zScore).toFixed(1)} standard deviations from ${monthsForAvg.length}-month rolling average (avg: ${avgData.avg.toFixed(2)}, current: ${currentAmount.toFixed(2)})`,
        });
      }
    }

    // New service check (appeared for first time)
    if (!prevCosts.has(productCode) && currentAmount > 0 && prevMonth) {
      anomalies.push({
        type: 'new_service',
        productName,
        productCode,
        currentAmount,
        previousAmount: null,
        changePct: 100,
        severity: currentAmount > 100 ? 'medium' : 'low',
        explanation: `${productName} appeared for the first time this month with cost ${currentAmount.toFixed(2)}`,
      });
    }

    // Zero to nonzero check
    if (prevAmount === 0 && currentAmount > 100 && prevMonth) {
      anomalies.push({
        type: 'zero_to_nonzero',
        productName,
        productCode,
        currentAmount,
        previousAmount: 0,
        changePct: 100,
        severity: 'medium',
        explanation: `${productName} went from zero cost to ${currentAmount.toFixed(2)}`,
      });
    }
  }

  // Check for disappeared services
  if (prevMonth) {
    for (const [productCode, prevAmount] of prevCosts) {
      if (!currentCosts.has(productCode) && prevAmount > 50) {
        anomalies.push({
          type: 'month_over_month',
          productName: productCode,
          productCode,
          currentAmount: 0,
          previousAmount: prevAmount,
          changePct: -100,
          severity: 'low',
          explanation: `${productCode} cost dropped to zero (was ${prevAmount.toFixed(2)} last month)`,
        });
      }
    }
  }

  return anomalies.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Get cost map by product code for a given month.
 */
async function getProductCosts(month: string): Promise<Map<string, number>> {
  const result = await db
    .select({
      productCode: billLineItems.productCode,
      amount: sql<number>`COALESCE(SUM(${billLineItems.pretaxAmount}::numeric), 0)`,
    })
    .from(billLineItems)
    .where(
      and(
        isNotNull(billLineItems.productCode),
        sql`${billLineItems.billingDate} LIKE ${month + '%'}`
      )
    )
    .groupBy(billLineItems.productCode);

  const map = new Map<string, number>();
  for (const row of result) {
    if (row.productCode) {
      map.set(row.productCode, Number(row.amount));
    }
  }
  return map;
}
