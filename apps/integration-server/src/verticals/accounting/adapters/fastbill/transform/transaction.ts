import type { Transaction } from '../../../schema/transaction';

export interface FastbillTransaction {
  PAYMENT_ID: string | number;
  PAYMENT_DATE?: string;
  AMOUNT?: number;
  DESCRIPTION?: string;
  CUSTOMER_ID?: string | number;
  CUSTOMER_NAME?: string;
  [key: string]: unknown;
}

export function transformTransaction(raw: FastbillTransaction): Transaction {
  return {
    id: String(raw.PAYMENT_ID),
    memo: raw.DESCRIPTION,
    totalAmount: raw.AMOUNT,
    createdAt: raw.PAYMENT_DATE ? new Date(raw.PAYMENT_DATE) : undefined,
    contacts: raw.CUSTOMER_ID !== undefined
      ? [{ id: String(raw.CUSTOMER_ID), name: raw.CUSTOMER_NAME }]
      : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type FastBillTransaction = FastbillTransaction
