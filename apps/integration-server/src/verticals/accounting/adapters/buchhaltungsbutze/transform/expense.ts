import type { Expense } from '../../../schema/expense';
import type { Lineitem } from '../../../schema/shared';

export interface BuchhaltungsbutzeExpenseItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  tax?: number;
  gross?: number;
  [key: string]: unknown;
}

export interface BuchhaltungsbutzeExpense {
  id: string | number;
  date?: string;
  total?: number;
  tax?: number;
  employee_id?: string | number;
  items?: BuchhaltungsbutzeExpenseItem[];
  [key: string]: unknown;
}

export function transformExpense(raw: BuchhaltungsbutzeExpense): Expense {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    taxAmount: item.tax,
    totalAmount: item.gross,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax,
    userId: raw.employee_id !== undefined ? String(raw.employee_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type BuchhaltungsButzeExpense = BuchhaltungsbutzeExpense
