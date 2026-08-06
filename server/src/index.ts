import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import billsRouter from './routes/bills.js';
import costsRouter from './routes/costs.js';
import anomaliesRouter from './routes/anomalies.js';
import savingsRouter from './routes/savings.js';
import budgetsRouter from './routes/budgets.js';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

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

app.listen(port, () => {
  console.log(`FinOps API server running on http://localhost:${port}`);
});
