/**
 * MineralTree payment → canonical Transaction transform.
 *
 * Endpoint: GET /mtapi/base/services/payment/{companyId}
 *
 * MineralTree payments represent AP disbursements to vendors.
 * A payment references one or more bills via the `bills[]` array.
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import { toMinorUnits } from './money'

interface MtMoney {
  amount?: number
  currency?: string
}

interface MtPaymentBill {
  id?: string
  appliedPaymentAmount?: MtMoney
  [key: string]: unknown
}

export interface MtPayment {
  id?: string
  externalId?: string
  paymentMethod?: { id?: string; type?: string }
  fundMethod?: {
    type?: string   // CHECK | CREDITCARD | ACH | WIRE | VCARD | ECHECK | BILLPAY | CREDIT
  }
  vendor?: { id?: string; name?: string }
  amount?: MtMoney
  transactionDate?: string  // yyyy-MM-dd
  checkNumber?: string
  sequenceText?: string
  bills?: MtPaymentBill[]
  [key: string]: unknown
}

function mapLineitems(raw: MtPayment): TransactionLineitem[] {
  return (raw.bills ?? []).map((b) => ({
    id: b.id || undefined,
    accountId: b.id || undefined,
    totalAmount: toMinorUnits(b.appliedPaymentAmount?.amount),
  }))
}

export function transformTransaction(raw: MtPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.vendor?.id) {
    contacts.push({ id: raw.vendor.id, name: raw.vendor.name || undefined })
  }

  const lineItems = mapLineitems(raw)
  const fundType = raw.fundMethod?.type ?? raw.paymentMethod?.type ?? undefined

  return {
    id: raw.id || undefined,
    type: fundType || undefined,
    reference: raw.checkNumber ?? raw.sequenceText ?? raw.externalId ?? undefined,
    paymentMethod: fundType || undefined,
    currency: raw.amount?.currency || undefined,
    totalAmount: toMinorUnits(raw.amount?.amount),
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    createdAt: raw.transactionDate ? new Date(raw.transactionDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
