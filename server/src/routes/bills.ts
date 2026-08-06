import { Router } from 'express';
import fs from 'fs';
import { db } from '../db/index.js';
import { bills, billLineItems } from '../db/schema.js';
import { upload } from '../middleware/upload.js';
import { parseAlibabaCsv } from '../services/csvParser.js';
import { eq } from 'drizzle-orm';

const router = Router();

// Upload CSV bill
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csvContent = fs.readFileSync(req.file.path, 'utf-8');
    const tempId = crypto.randomUUID();

    // Parse CSV content
    const result = parseAlibabaCsv(csvContent, tempId);

    // Insert bill record
    const [bill] = await db
      .insert(bills)
      .values({
        id: tempId,
        billingMonth: result.billingMonth,
        fileName: req.file.originalname,
        totalAmount: String(result.totalAmount.toFixed(2)),
        currency: result.currency,
      })
      .returning();

    // Insert line items in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < result.items.length; i += BATCH_SIZE) {
      const batch = result.items.slice(i, i + BATCH_SIZE).map((item) => ({
        ...item,
        billId: bill.id,
        id: crypto.randomUUID(),
      }));
      await db.insert(billLineItems).values(batch);
    }

    res.json({
      id: bill.id,
      billingMonth: bill.billingMonth,
      fileName: bill.fileName,
      totalAmount: bill.totalAmount,
      currency: bill.currency,
      rowCount: result.rowCount,
      unmappedColumns: result.unmappedColumns,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
});

// List all bills
router.get('/', async (_req, res) => {
  try {
    const allBills = await db
      .select()
      .from(bills)
      .orderBy(bills.uploadedAt);

    // Get line item count per bill
    const billsWithCounts = await Promise.all(
      allBills.map(async (bill) => {
        const [count] = await db
          .select({ count: eq(billLineItems.billId, bill.id) })
          .from(billLineItems)
          .where(eq(billLineItems.billId, bill.id));
        return {
          ...bill,
          lineItemCount: count?.count ?? 0,
        };
      })
    );

    res.json(billsWithCounts);
  } catch (error) {
    console.error('List bills error:', error);
    res.status(500).json({ error: 'Failed to list bills' });
  }
});

// Delete a bill
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete line items first (cascade should handle it, but be explicit)
    await db.delete(billLineItems).where(eq(billLineItems.billId, id));
    await db.delete(bills).where(eq(bills.id, id));

    res.json({ success: true });
  } catch (error) {
    console.error('Delete bill error:', error);
    res.status(500).json({ error: 'Failed to delete bill' });
  }
});

export default router;
