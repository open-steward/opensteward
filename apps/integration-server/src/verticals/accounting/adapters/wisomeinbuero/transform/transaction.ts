/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Transaction } from '../../../schema/transaction';

export interface WisomeinbueroTransaction {
  id: string | number;
  date?: string;
  amount?: number;
  description?: string;
  reference?: string;
  accountId?: string | number;
  contactId?: string | number;
  contactName?: string;
  [key: string]: unknown;
}

export function transformTransaction(raw: WisomeinbueroTransaction): Transaction {
  return {
    id: String(raw.id),
    memo: raw.description,
    totalAmount: raw.amount,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    accountId: raw.accountId !== undefined ? String(raw.accountId) : undefined,
    contacts: raw.contactId !== undefined
      ? [{ id: String(raw.contactId), name: raw.contactName }]
      : undefined,
    metadata: raw as Record<string, unknown>,
  };
}

export type WisoTransaction = WisomeinbueroTransaction
