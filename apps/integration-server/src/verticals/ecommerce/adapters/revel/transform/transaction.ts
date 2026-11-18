/**
 * Revel Payment → canonical Transaction.
 *
 * Revel payments are listed at `/resources/Payment/` and read one at a time at
 * `/resources/Payment/{PaymentId}/`; the row is the Payment schema of
 * orders_suite.yaml (2025.3.0, https://oas-prod.s3.amazonaws.com/oas/2025.3.0/orders_suite.yaml).
 * Its money fields are decimal STRINGS (`amount`: "type: string, format:
 * float", example '2.660000'), its datetimes carry no offset (example
 * 2018-07-18T04:00:00, read as UTC like every offset-less upstream time), and
 * `payment_type` is the EnumPaymentType of general_suite.yaml.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Transaction, TransactionKind } from '../../../schema/transaction'
import { extractId } from './inventory'
import { majorToMinor } from '../../../schema/shared'

export interface RawRevelPayment {
  id: number
  /** "URI of an Order API object for which this payment is created". */
  order?: string | number
  /** Decimal string ("type: string, format: float"); a number is read too. */
  amount?: string | number
  tip?: string | number
  /** EnumPaymentType; see PAYMENT_TYPES. */
  payment_type?: number
  /** "Response received and representing payment transaction status" — free text ("Accepted"). */
  transaction_status?: string
  transaction_id?: string
  last_4_cc_digits?: string
  auth_code?: string
  /** "Date and time when the payment occurs". */
  payment_date?: string
  /** "Date and time when payment is created". */
  created_date?: string
  updated_date?: string
  [key: string]: unknown
}

/**
 * EnumPaymentType (general_suite.yaml, 2025.3.0): "ID of the payment type, i.e.
 * cash, credit card, gift, paypal, etc", 0 - OTHER … 32 - DEPOSIT.
 */
const PAYMENT_TYPES: readonly string[] = [
  'OTHER',
  'CASH',
  'CREDIT',
  'CHECK',
  'GIFT',
  'CREDITMANUAL',
  'CREDITPLUS',
  'EXTERNALLEVELUP',
  'DEBIT',
  'BADGE',
  'INDEX',
  'PAYPAL',
  'EBT_FOODSTAMP',
  'BITCOIN',
  'EBT_CASH',
  'ZAPPER',
  'SSMC',
  'SALE_LOSS_DRIVE_OFF',
  'FLEET_CARD',
  'FLEET_CARD_MANUAL',
  'WORAPAY',
  'STORE_CREDIT',
  'COMO',
  'LOYALTYPLANT',
  'VOUCHER',
  'RABBIT',
  'LINEPAY',
  'WECHAT_ALIPAY',
  'LCMS_VOUCHER',
  'NETS',
  'LEVELUP_GIFT',
  'SERVICECHARGE',
  'DEPOSIT',
]

/** A documented decimal string, or a number; undefined when neither reads. */
function decimal(value: string | number | undefined): number | undefined {
  if (value == null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

function mapKind(_raw: RawRevelPayment): TransactionKind {
  // Revel payments are always direct charges (sales)
  return 'SALE'
}

export function transformTransaction(raw: RawRevelPayment): Transaction {
  const currency = 'USD'
  const orderId = raw.order ? extractId(raw.order as string | number) : undefined
  const amount = decimal(raw.amount)
  const type = raw.payment_type != null ? PAYMENT_TYPES[raw.payment_type] : undefined

  return {
    id: String(raw.id),
    orderId: orderId || undefined,
    kind: mapKind(raw),
    // Revel enumerates no payment status: `transaction_status` is free text.
    status: undefined,
    amount: amount !== undefined ? { amount: majorToMinor(amount, currency), currency } : undefined,
    gateway: type ? `revel_${type.toLowerCase()}` : 'revel',
    authorizationCode: raw.auth_code ?? undefined,
    processedAt: toIsoDatetime(raw.payment_date ?? raw.created_date),
    createdAt: toIsoDatetime(raw.created_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
