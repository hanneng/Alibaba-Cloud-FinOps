export interface Bill {
  id: string;
  billingMonth: string;
  fileName: string;
  uploadedAt: string;
  totalAmount: string;
  currency: string;
  lineItemCount?: number;
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

export interface Budget {
  id: string;
  name: string;
  monthlyLimit: string;
  tagRules: Array<{ key: string; value: string }>;
  color: string;
  createdAt: string;
  currentSpend?: number;
  utilizationPct?: number;
  tags?: Array<{ id: string; key: string; value: string; budgetId: string }>;
}

export interface AnomalyRule {
  id: string;
  productCode: string | null;
  thresholdPct: string;
  comparisonMode: string;
}

export interface ComparisonResult {
  month1: string;
  month2: string;
  totalMonth1: number;
  totalMonth2: number;
  totalChange: number;
  totalChangePct: number;
  services: Array<{
    name: string;
    m1: number;
    m2: number;
    change: number;
    changePct: number;
  }>;
}

export interface UploadResult {
  id: string;
  billingMonth: string;
  fileName: string;
  totalAmount: string;
  currency: string;
  rowCount: number;
  unmappedColumns: string[];
}
