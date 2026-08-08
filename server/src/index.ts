import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';

import billsRouter from './routes/bills.js';
import costsRouter from './routes/costs.js';
import anomaliesRouter from './routes/anomalies.js';
import savingsRouter from './routes/savings.js';
import budgetsRouter from './routes/budgets.js';
import resourceGroupsRouter from './routes/resourceGroups.js';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

/**
 * Auto-initialize database tables on startup.
 * Creates tables if they don't already exist.
 */
async function initDatabase() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        billing_month VARCHAR(7) NOT NULL,
        file_name TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT NOW() NOT NULL,
        total_amount NUMERIC(14, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD' NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bill_line_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
        account_id TEXT, product_code TEXT, product_name TEXT,
        product_detail TEXT, subscription_type TEXT, region TEXT,
        instance_id TEXT, resource_name TEXT, billing_item TEXT,
        usage NUMERIC(20, 6), unit TEXT,
        pretax_amount NUMERIC(14, 2),
        deducted_by_cash_coupons NUMERIC(14, 2),
        payment_amount NUMERIC(14, 2),
        billing_date DATE, tags JSONB, raw_data JSONB
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
        key TEXT NOT NULL, value TEXT NOT NULL,
        budget_id UUID REFERENCES budget_allocations(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS anomaly_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_code TEXT,
        threshold_pct NUMERIC(5, 2) DEFAULT 30.00 NOT NULL,
        comparison_mode TEXT DEFAULT 'month_over_month' NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resource_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        color VARCHAR(7) DEFAULT '#3B82F6' NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resource_group_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES resource_groups(id) ON DELETE CASCADE,
        resource_name TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rgm_group_id ON resource_group_members(group_id);
      CREATE INDEX IF NOT EXISTS idx_rgm_resource_name ON resource_group_members(resource_name);
    `);
    console.log('Database tables ready');
  } catch (err) {
    console.error('Database init error:', err);
  } finally {
    await pool.end();
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/bills', billsRouter);
app.use('/api/costs', costsRouter);
app.use('/api/anomalies', anomaliesRouter);
app.use('/api/savings', savingsRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/groups', resourceGroupsRouter);

// Error handling
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
);

app.listen(port, async () => {
  // Ensure uploads directory exists
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  await initDatabase();
  console.log(`FinOps API server running on http://localhost:${port}`);
});
