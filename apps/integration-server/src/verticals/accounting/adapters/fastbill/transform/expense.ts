import type { Expense } from '../../../schema/expense';
import type { Lineitem } from '../../../schema/shared';

export interface FastbillExpenseItem {
  DESCRIPTION?: string;
  QUANTITY?: number;
  UNIT_PRICE?: number;
  VAT_VALUE?: number;
  COMPLETE_NET?: number;
  COMPLETE_GROSS?: number;
  [key: string]: unknown;
}

export interface FastbillExpense {
  EXPENSE_ID: string | number;
  EXPENSE_DATE?: string;
  TOTAL_AMOUNT?: number;
  VAT_AMOUNT?: number;
  EMPLOYEE_ID?: string | number;
  ITEMS?: FastbillExpenseItem[];
  [key: string]: unknown;
}

export function transformExpense(raw: FastbillExpense): Expense {
  const lineItems: Lineitem[] = (raw.ITEMS ?? []).map((item) => ({
    description: item.DESCRIPTION,
    quantity: item.QUANTITY,
    unitAmount: item.UNIT_PRICE,
    taxAmount: item.VAT_VALUE,
    totalAmount: item.COMPLETE_GROSS,
    metadata: item as Record<string, unknown>,
  }));

  return {
    id: String(raw.EXPENSE_ID),
    postedAt: raw.EXPENSE_DATE ? new Date(raw.EXPENSE_DATE) : undefined,
    totalAmount: raw.TOTAL_AMOUNT,
    taxAmount: raw.VAT_AMOUNT,
    userId: raw.EMPLOYEE_ID !== undefined ? String(raw.EMPLOYEE_ID) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type FastBillExpense = FastbillExpense
