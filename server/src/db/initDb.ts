/**
 * Production database initialization script.
 * Pushes the Drizzle schema to PostgreSQL and creates tables.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

async function initDatabase() {
  console.log('Connecting to database...');
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Test connection
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('Database connection successful');
  } finally {
    client.release();
  }

  // Create tables using Drizzle
  const db = drizzle(pool, { schema });

  console.log('Creating tables...');

  // Use raw SQL to create tables (equivalent to drizzle-kit push)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bills (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_month VARCHAR(7) NOT NULL,
      file_name TEXT NOT NULL,
      uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL,
      total_amount NUMERIC(14, 2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'CNY' NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bill_line_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      account_id TEXT,
      product_code TEXT,
      product_name TEXT,
      product_detail TEXT,
      subscription_type TEXT,
      region TEXT,
      instance_id TEXT,
      resource_name TEXT,
      billing_item TEXT,
      usage NUMERIC(20, 6),
      unit TEXT,
      pretax_amount NUMERIC(14, 2),
      deducted_by_cash_coupons NUMERIC(14, 2),
      payment_amount NUMERIC(14, 2),
      billing_date DATE,
      tags JSONB,
      raw_data JSONB
    );

    CREATE INDEX IF NOT EXISTS idx_bill_id ON bill_line_items(bill_id);
    CREATE INDEX IF NOT EXISTS idx_product_code ON bill_line_items(product_code);
    CREATE INDEX IF NOT EXISTS idx_region ON bill_line_items(region);
    CREATE INDEX IF NOT EXISTS idx_billing_date ON bill_line_items(billing_date);
    CREATE INDEX IF NOT EXISTS idx_subscription_type ON bill_line_items(subscription_type);

    CREATE TABLE IF NOT EXISTS budget_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      monthly_limit NUMERIC(14, 2) NOT NULL,
      tag_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
      color VARCHAR(7) DEFAULT '#3B82F6' NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cost_tags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      budget_id UUID REFERENCES budget_allocations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS anomaly_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_code TEXT,
      threshold_pct NUMERIC(5, 2) DEFAULT 30.00 NOT NULL,
      comparison_mode TEXT DEFAULT 'month_over_month' NOT NULL
    );
  `);

  console.log('All tables created successfully');
  await pool.end();
}

initDatabase().catch((err) => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
