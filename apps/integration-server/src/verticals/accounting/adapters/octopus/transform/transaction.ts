/**
 * Octopus → canonical Transaction transform.
 *
 * Octopus REST API endpoint: GET /payments, GET /payments/{id}
 *
 * Payments (betalingen) represent cash receipts and disbursements that settle
 * open invoices or purchase invoices in the Octopus ledger.
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface OctopusPayment {
  paymentId?: number
  paymentNumber?: string
  reference?: string
  relationId?: number
  relationName?: string
  accountNumber?: string
  paymentDate?: string
  currency?: string
  amount?: number
  totalAmount?: number
  paymentType?: string
  memo?: string
  [key: string]: unknown
}

function mapLineitems(raw: OctopusPayment): TransactionLineitem[] {
  return [
    {
      accountId: raw.accountNumber || undefined,
      name: raw.paymentType || undefined,
      totalAmount: raw.amount ?? raw.totalAmount,
    },
  ]
}

export function transformTransaction(raw: OctopusPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.relationId !== undefined) {
    contacts.push({
      id: String(raw.relationId),
      name: raw.relationName || undefined,
    })
  }

  return {
    id: raw.paymentId !== undefined ? String(raw.paymentId) : raw.paymentNumber || undefined,
    accountId: raw.accountNumber || undefined,
    type: raw.paymentType || undefined,
    reference: raw.reference || undefined,
    memo: raw.memo || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount ?? raw.totalAmount,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.paymentDate ? new Date(raw.paymentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
