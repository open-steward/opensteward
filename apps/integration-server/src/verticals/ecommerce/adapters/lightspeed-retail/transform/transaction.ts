/**
 * Lightspeed Retail SalePayment → canonical Transaction.
 *
 * SalePayments represent individual payment tenders on a Sale. Each has
 * an amount, payment type, and link back to the parent Sale.
 */

import type { Transaction, TransactionStatus } from '../../../schema/transaction'
import { lsDecimalToNumber } from './product'
import { majorToMinor } from '../../../schema/shared'

export interface RawLightspeedSalePayment {
  salePaymentID: string
  saleID?: string
  paymentTypeID?: string
  amount?: string
  tipAmount?: string
  createTime?: string
  timeStamp?: string
  PaymentType?: {
    paymentTypeID?: string
    name?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function mapStatus(amount: string | undefined): TransactionStatus {
  // SalePayments in Lightspeed are always completed once recorded
  if (amount != null) return 'SUCCESS'
  return 'PENDING'
}

export function transformTransaction(raw: RawLightspeedSalePayment): Transaction {
  const amount = majorToMinor(lsDecimalToNumber(raw.amount), 'USD')
  const gateway = raw.PaymentType?.name?.toLowerCase() ?? 'lightspeed'
  return {
    id: raw.salePaymentID,
    orderId: raw.saleID ?? undefined,
    kind: 'SALE',
    status: mapStatus(raw.amount),
    amount: { amount, currency: 'USD' },
    gateway: `lightspeed_${gateway}`,
    processedAt: raw.createTime,
    createdAt: raw.createTime,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
