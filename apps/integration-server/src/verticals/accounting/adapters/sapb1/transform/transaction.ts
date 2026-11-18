/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface SapB1Payment {
  DocNum: number
  CardCode: string
  CardName: string
  DocDate: string
  DocCurrency: string
  DocTotal: number
  TransferSum: number
  Remarks: string
  Cancelled: 'Y' | 'N'
  [key: string]: unknown
}

export function transformTransaction(raw: SapB1Payment): Transaction {
  const contacts: TransactionContact[] = [
    {
      id: raw.CardCode || undefined,
      name: raw.CardName || undefined,
    },
  ]

  return {
    id: String(raw.DocNum),
    memo: raw.Remarks || undefined,
    currency: raw.DocCurrency || undefined,
    totalAmount: raw.DocTotal,
    contacts,
    createdAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
