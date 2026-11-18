/**
 * Stampli AP payment → canonical Transaction transform.
 *
 * Stampli records outgoing vendor payments as payment objects.
 *
 * Wire shape (camelCase JSON):
 *   id, invoiceId, vendorId, vendorName, paymentMethod, amount,
 *   currency, status, paymentDate, referenceNumber, memo,
 *   createdAt, updatedAt
 *
 * Money: Stampli amounts are decimal floats (e.g. 12.50). Canonical
 * amounts are integer minor units — multiply by 100 and round.
 *
 * Dates: `createdAt` is the platform record-creation timestamp.
 * `paymentDate` is the execution date of the payment; it does not
 * belong in `createdAt` — it is stored in `metadata` only via `raw`.
 */
import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

export interface StampliPayment {
  id: string
  invoiceId?: string
  invoiceNumber?: string
  vendorId?: string
  vendorName?: string
  paymentMethod?: string
  amount?: number
  currency?: string
  status?: string
  paymentDate?: string
  referenceNumber?: string
  memo?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapLineitems(raw: StampliPayment): TransactionLineitem[] {
  if (raw.amount === undefined) return []
  return [
    {
      description: raw.memo || undefined,
      totalAmount: toMinorUnits(raw.amount),
    },
  ]
}

export function transformTransaction(raw: StampliPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.vendorId) {
    contacts.push({ id: raw.vendorId, name: raw.vendorName || undefined })
  }

  return {
    id: raw.id,
    type: 'PAYMENT',
    reference: raw.invoiceNumber || raw.invoiceId || raw.referenceNumber || undefined,
    memo: raw.memo || undefined,
    paymentMethod: raw.paymentMethod || undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.amount),
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
