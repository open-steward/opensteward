import type { Expense } from '../../../schema/expense';
import type { Lineitem } from '../../../schema/shared';

export interface InvoiceportalExpenseItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  tax_amount?: number;
  total_amount?: number;
  [key: string]: unknown;
}

export interface InvoiceportalExpense {
  id: string | number;
  date?: string;
  total_amount?: number;
  tax_amount?: number;
  employee_id?: string | number;
  items?: InvoiceportalExpenseItem[];
  [key: string]: unknown;
}

export function transformExpense(raw: InvoiceportalExpense): Expense {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    taxAmount: item.tax_amount,
    totalAmount: item.total_amount,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    userId: raw.employee_id !== undefined ? String(raw.employee_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type InvoicePortalExpense = InvoiceportalExpense
