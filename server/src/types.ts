export interface BillLineItem {
  id: string;
  billId: string;
  accountId: string | null;
  productCode: string | null;
  productName: string | null;
  productDetail: string | null;
  subscriptionType: string | null;
  region: string | null;
  instanceId: string | null;
  resourceName: string | null;
  billingItem: string | null;
  usage: string | null;
  unit: string | null;
  pretaxAmount: string | null;
  deductedByCashCoupons: string | null;
  paymentAmount: string | null;
  billingDate: string | null;
  tags: Record<string, string> | null;
  rawData: Record<string, string> | null;
}

export interface Bill {
  id: string;
  billingMonth: string;
  fileName: string;
  uploadedAt: string;
  totalAmount: string;
  currency: string;
}

export interface BudgetAllocation {
  id: string;
  name: string;
  monthlyLimit: string;
  tagRules: Array<{ key: string; value: string }>;
  color: string;
  createdAt: string;
}

export interface CostTag {
  id: string;
  key: string;
  value: string;
  budgetId: string | null;
}

export interface AnomalyRule {
  id: string;
  productCode: string | null;
  thresholdPct: string;
  comparisonMode: string;
}

export interface Anomaly {
  type: 'month_over_month' | 'rolling_avg' | 'new_service' | 'zero_to_nonzero';
  productName: string;
  productCode: string | null;
  currentAmount: number;
  previousAmount: number | null;
  changePct: number;
  severity: 'high' | 'medium' | 'low';
  explanation: string;
}

export interface SavingsItem {
  type: 'idle' | 'reserved_instance' | 'rightsizing';
  productName: string;
  productCode: string | null;
  instanceId: string | null;
  region: string | null;
  currentCost: number;
  estimatedSavings: number;
  recommendation: string;
}

export interface CostTrend {
  period: string;
  amount: number;
}

export interface CostByDimension {
  name: string;
  amount: number;
  percentage: number;
}

export interface TopResource {
  instanceId: string | null;
  resourceName: string | null;
  productName: string;
  productCode: string | null;
  region: string | null;
  amount: number;
}
