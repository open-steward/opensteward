import type { Expense } from '../../../schema/expense';

export interface PaperlessngxExpense {
  id: string | number;
  title: string;
  created: string;
  [key: string]: unknown;
}

export function transformExpense(raw: PaperlessngxExpense): Expense {
  return {
    id: String(raw.id),
    postedAt: raw.created ? new Date(raw.created) : undefined,
    totalAmount: 0,
    metadata: raw as Record<string, unknown>,
  };
}
