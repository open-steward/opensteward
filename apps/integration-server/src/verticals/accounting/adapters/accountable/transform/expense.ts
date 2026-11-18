import type { Expense } from '../../../schema/expense';
import type { Lineitem } from '../../../schema/shared';

export interface AccountableExpenseItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  vatAmount?: number;
  totalPrice?: number;
  [key: string]: unknown;
}

export interface AccountableExpense {
  id: string | number;
  date?: string;
  totalAmount?: number;
  vatAmount?: number;
  userId?: string | number;
  items?: AccountableExpenseItem[];
  [key: string]: unknown;
}

export function transformExpense(raw: AccountableExpense): Expense {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitPrice,
    taxAmount: item.vatAmount,
    totalAmount: item.totalPrice,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    userId: raw.userId !== undefined ? String(raw.userId) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}
