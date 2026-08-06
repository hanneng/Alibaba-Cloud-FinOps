import Papa from 'papaparse';
import { v4 as uuid } from 'uuid';
import type { BillLineItem } from '../types.js';

/**
 * Column mapping for Alibaba Cloud billing CSVs.
 * Supports both Chinese and English column names.
 */
const COLUMN_MAP: Record<string, string & keyof BillLineItem> = {
  // English columns
  'Account ID': 'accountId',
  'Product Code': 'productCode',
  'Product Name': 'productName',
  'Product Detail': 'productDetail',
  'Subscription Type': 'subscriptionType',
  Region: 'region',
  'Instance ID': 'instanceId',
  'Resource Name': 'resourceName',
  'Billing Item': 'billingItem',
  Usage: 'usage',
  Unit: 'unit',
  'Pretax Amount': 'pretaxAmount',
  'Deducted By Cash Coupons': 'deductedByCashCoupons',
  'Payment Amount': 'paymentAmount',
  'Billing Date': 'billingDate',
  // Chinese columns
  账号ID: 'accountId',
  产品代码: 'productCode',
  产品名称: 'productName',
  产品明细: 'productDetail',
  计费方式: 'subscriptionType',
  地域: 'region',
  实例ID: 'instanceId',
  资源名称: 'resourceName',
  计费项: 'billingItem',
  用量: 'usage',
  单位: 'unit',
  应付金额: 'pretaxAmount',
  代金券抵扣: 'deductedByCashCoupons',
  现金支付: 'paymentAmount',
  账单日期: 'billingDate',
  消费时间: 'billingDate',
  服务时间: 'billingDate',
};

/**
 * Parse a monetary value string into a number.
 * Handles commas, currency symbols, and whitespace.
 */
function parseMoney(value: string | undefined | null): number | null {
  if (!value || value === '-' || value === '') return null;
  const cleaned = String(value)
    .replace(/[¥$€,]/g, '')
    .replace(/\s/g, '')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Normalize subscription type labels.
 */
function normalizeSubscriptionType(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.includes('payasyougo') || v.includes('按量') || v.includes('pay-as-you-go')) {
    return 'Pay-As-You-Go';
  }
  if (v.includes('subscription') || v.includes('包年') || v.includes('包月') || v.includes('prepaid')) {
    return 'Subscription';
  }
  return value.trim();
}

/**
 * Normalize billing date to YYYY-MM-DD format.
 */
function normalizeDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim();
  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    return v.substring(0, 10);
  }
  // Handle YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}/.test(v)) {
    return v.replace(/\//g, '-').substring(0, 10);
  }
  // Handle YYYYMMDD
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }
  return v;
}

/**
 * Extract billing month from a date string (YYYY-MM).
 */
export function extractBillingMonth(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-?(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  return null;
}

/**
 * Detect column mapping from CSV header row.
 */
function detectColumnMapping(
  headers: string[]
): Map<number, string & keyof BillLineItem> {
  const mapping = new Map<number, string & keyof BillLineItem>();
  headers.forEach((header, index) => {
    const trimmed = header.trim();
    const mapped = COLUMN_MAP[trimmed];
    if (mapped) {
      mapping.set(index, mapped);
    }
  });
  return mapping;
}

export interface ParseResult {
  items: Array<Omit<BillLineItem, 'id'>>;
  billingMonth: string;
  totalAmount: number;
  currency: string;
  rowCount: number;
  unmappedColumns: string[];
}

/**
 * Parse Alibaba Cloud billing CSV content into structured line items.
 */
export function parseAlibabaCsv(
  csvContent: string,
  billId: string
): ParseResult {
  // Use PapaParse to handle various CSV formats (with/without BOM, quoted fields, etc.)
  const parsed = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
    encoding: 'utf-8',
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(
      `CSV parse error: ${parsed.errors.map((e) => e.message).join(', ')}`
    );
  }

  const headers = parsed.meta.fields || [];
  const columnMapping = detectColumnMapping(headers);
  const mappedFields = new Set(columnMapping.values());

  // Track unmapped columns
  const unmappedColumns = headers.filter((h) => {
    const trimmed = h.trim();
    return !COLUMN_MAP[trimmed];
  });

  const items: Array<Omit<BillLineItem, 'id'>> = [];
  let totalAmount = 0;
  let currency = 'CNY';
  let detectedMonth: string | null = null;

  for (const row of parsed.data) {
    const mapped: Partial<BillLineItem> = {};

    // Map each header to its field
    for (const header of headers) {
      const trimmed = header.trim();
      const field = COLUMN_MAP[trimmed];
      if (field && row[header] !== undefined) {
        (mapped as Record<string, unknown>)[field] = row[header].trim();
      }
    }

    // Skip completely empty rows
    if (!mapped.productName && !mapped.instanceId && !mapped.pretaxAmount) {
      continue;
    }

    // Parse numeric fields
    const pretaxAmount = parseMoney(mapped.pretaxAmount as unknown as string);
    const usageVal = mapped.usage
      ? parseFloat(String(mapped.usage).replace(/,/g, ''))
      : null;

    const paymentAmount = parseMoney(
      mapped.paymentAmount as unknown as string
    );
    const deductedByCashCoupons = parseMoney(
      mapped.deductedByCashCoupons as unknown as string
    );

    // Detect currency from pretax amount string
    if (mapped.pretaxAmount) {
      const raw = String(mapped.pretaxAmount);
      if (raw.includes('$') || raw.toUpperCase().includes('USD')) currency = 'USD';
      else if (raw.toUpperCase().includes('CNY') || raw.includes('¥'))
        currency = 'CNY';
    }

    // Normalize date and detect month
    const billingDate = normalizeDate(mapped.billingDate as unknown as string);
    if (!detectedMonth && billingDate) {
      detectedMonth = extractBillingMonth(billingDate);
    }

    // Build raw data from unmapped columns
    const rawData: Record<string, string> = {};
    for (const col of unmappedColumns) {
      if (row[col] !== undefined && row[col].trim()) {
        rawData[col.trim()] = row[col].trim();
      }
    }

    const amount = pretaxAmount ?? 0;
    totalAmount += amount;

    items.push({
      billId,
      accountId: (mapped.accountId as string) || null,
      productCode: (mapped.productCode as string) || null,
      productName: (mapped.productName as string) || null,
      productDetail: (mapped.productDetail as string) || null,
      subscriptionType: normalizeSubscriptionType(
        mapped.subscriptionType as unknown as string
      ),
      region: (mapped.region as string) || null,
      instanceId: (mapped.instanceId as string) || null,
      resourceName: (mapped.resourceName as string) || null,
      billingItem: (mapped.billingItem as string) || null,
      usage: usageVal !== null ? String(usageVal) : null,
      unit: (mapped.unit as string) || null,
      pretaxAmount: amount !== null ? String(amount) : '0',
      deductedByCashCoupons:
        deductedByCashCoupons !== null ? String(deductedByCashCoupons) : null,
      paymentAmount: paymentAmount !== null ? String(paymentAmount) : null,
      billingDate,
      tags: null,
      rawData: Object.keys(rawData).length > 0 ? rawData : null,
    });
  }

  return {
    items,
    billingMonth: detectedMonth || new Date().toISOString().substring(0, 7),
    totalAmount,
    currency,
    rowCount: items.length,
    unmappedColumns,
  };
}
