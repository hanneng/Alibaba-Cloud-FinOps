import {
  pgTable,
  uuid,
  text,
  varchar,
  numeric,
  timestamp,
  date,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const bills = pgTable('bills', {
  id: uuid('id').primaryKey().defaultRandom(),
  billingMonth: varchar('billing_month', { length: 7 }).notNull(),
  fileName: text('file_name').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('CNY').notNull(),
});

export const billLineItems = pgTable(
  'bill_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    accountId: text('account_id'),
    productCode: text('product_code'),
    productName: text('product_name'),
    productDetail: text('product_detail'),
    subscriptionType: text('subscription_type'),
    region: text('region'),
    instanceId: text('instance_id'),
    resourceName: text('resource_name'),
    billingItem: text('billing_item'),
    usage: numeric('usage', { precision: 20, scale: 6 }),
    unit: text('unit'),
    pretaxAmount: numeric('pretax_amount', { precision: 14, scale: 2 }),
    deductedByCashCoupons: numeric('deducted_by_cash_coupons', {
      precision: 14,
      scale: 2,
    }),
    paymentAmount: numeric('payment_amount', { precision: 14, scale: 2 }),
    billingDate: date('billing_date'),
    tags: jsonb('tags'),
    rawData: jsonb('raw_data'),
  },
  (table) => [
    index('idx_bill_id').on(table.billId),
    index('idx_product_code').on(table.productCode),
    index('idx_region').on(table.region),
    index('idx_billing_date').on(table.billingDate),
    index('idx_subscription_type').on(table.subscriptionType),
  ]
);

export const budgetAllocations = pgTable('budget_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  monthlyLimit: numeric('monthly_limit', { precision: 14, scale: 2 }).notNull(),
  tagRules: jsonb('tag_rules').notNull().default([]),
  color: varchar('color', { length: 7 }).default('#3B82F6').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const costTags = pgTable('cost_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  budgetId: uuid('budget_id').references(() => budgetAllocations.id, {
    onDelete: 'set null',
  }),
});

export const anomalyRules = pgTable('anomaly_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  productCode: text('product_code'),
  thresholdPct: numeric('threshold_pct', { precision: 5, scale: 2 })
    .default('30.00')
    .notNull(),
  comparisonMode: text('comparison_mode')
    .default('month_over_month')
    .notNull(),
});

export const resourceGroups = pgTable('resource_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  color: varchar('color', { length: 7 }).default('#3B82F6').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const resourceGroupMembers = pgTable(
  'resource_group_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => resourceGroups.id, { onDelete: 'cascade' }),
    resourceName: text('resource_name').notNull(),
  }
);
