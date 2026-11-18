/**
 * PrestaShop OrderPayment → canonical Transaction.
 *
 * PrestaShop exposes order payments under `/api/order_payments?filter[order_reference]={ref}`.
 * Each record represents a payment attempt (capture, refund, etc.).
 *
 * Key fields: id, order_reference, id_currency, amount, payment_method,
 *             transaction_id, date_add
 */
import type { Transaction, TransactionKind, TransactionStatus } from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawPrestaShopOrderPayment {
  id?: number | string
  order_reference?: string | null
  id_currency?: number | string | null
  amount?: string | number | null
  payment_method?: string | null
  transaction_id?: string | null
  card_brand?: string | null
  card_number?: string | null
  card_expiration?: string | null
  card_holder?: string | null
  conversion_rate?: string | number | null
  /** Currency ISO set by the adapter when enriching the response */
  _currency?: string
  date_add?: string | null
  [key: string]: unknown
}

function mapKind(paymentMethod: string | null | undefined): TransactionKind {
  if (!paymentMethod) return 'SALE'
  const m = paymentMethod.toLowerCase()
  if (m.includes('refund') || m.includes('remboursement')) return 'REFUND'
  if (m.includes('void') || m.includes('annul')) return 'VOID'
  if (m.includes('authoriz') || m.includes('authoris')) return 'AUTHORIZATION'
  return 'SALE'
}

export function transformTransaction(
  raw: RawPrestaShopOrderPayment,
  currency = 'EUR',
): Transaction {
  const cur = raw._currency ?? currency
  const amountNum =
    raw.amount != null
      ? parseFloat(String(raw.amount))
      : 0
  const isRefund = mapKind(raw.payment_method) === 'REFUND'
  const status: TransactionStatus = isRefund ? 'SUCCESS' : 'SUCCESS'

  return {
    id: String(raw.id ?? raw.transaction_id ?? ''),
    orderId: raw.order_reference ?? undefined,
    kind: mapKind(raw.payment_method),
    status,
    amount: {
      amount: majorToMinor(amountNum, cur),
      currency: cur,
    },
    gateway: raw.payment_method ?? undefined,
    authorizationCode: raw.transaction_id ?? undefined,
    processedAt: toIsoDatetime(raw.date_add),
    createdAt: toIsoDatetime(raw.date_add),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
