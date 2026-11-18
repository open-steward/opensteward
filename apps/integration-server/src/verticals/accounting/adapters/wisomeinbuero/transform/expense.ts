/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Expense } from '../../../schema/expense';
import type { Lineitem } from '../../../schema/shared';

export interface WisomeinbueroExpenseItem {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  vatAmount?: number;
  totalAmount?: number;
  [key: string]: unknown;
}

export interface WisomeinbueroExpense {
  id: string | number;
  date?: string;
  totalAmount?: number;
  vatAmount?: number;
  userId?: string | number;
  items?: WisomeinbueroExpenseItem[];
  [key: string]: unknown;
}

export function transformExpense(raw: WisomeinbueroExpense): Expense {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitPrice,
    taxAmount: item.vatAmount,
    totalAmount: item.totalAmount,
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

export type WisoExpense = WisomeinbueroExpense
