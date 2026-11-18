import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, toMinorUnits, strMap, fullName } from './shared'

/** FastSpring order line item. */
export interface RawFastspringOrderItem {
  product?: string
  display?: string
  sku?: string | null
  quantity?: number
  subtotal?: number
  subtotalDisplay?: string
}

/** FastSpring order — the platform's transaction / charge record. */
export interface RawFastspringOrder {
  id?: string
  order?: string
  reference?: string | null
  buyerReference?: string | null
  completed?: boolean
  changed?: number
  changedValue?: number
  language?: string | null
  live?: boolean
  currency?: string | null
  payoutCurrency?: string | null
  invoiceUrl?: string | null
  account?: { id?: string; account?: string } | string | null
  total?: number
  totalDisplay?: string
  tax?: number
  subtotal?: number
  discount?: number
  customer?: {
    first?: string | null
    last?: string | null
    email?: string | null
    company?: string | null
    phone?: string | null
  } | null
  items?: RawFastspringOrderItem[]
  payment?: { type?: string; cardEnding?: string } | null
  [k: string]: unknown
}

/**
 * FastSpring orders don't expose a card-gateway payment-state enum — an order
 * that exists in the API has been placed, and `completed` distinguishes a
 * finished checkout from a pending/abandoned one.
 */
function mapStatus(raw: RawFastspringOrder): ChargeStatus {
  if (raw.completed === true) return 'succeeded'
  return 'pending'
}

function accountId(account: RawFastspringOrder['account']): string | undefined {
  if (!account) return undefined
  if (typeof account === 'string') return account || undefined
  return account.id ?? account.account ?? undefined
}

export function transformCharge(raw: RawFastspringOrder): Charge {
  const id = String(raw.id ?? raw.order ?? '')
  return {
    id,
    externalId: String(raw.reference ?? raw.id ?? raw.order ?? ''),
    amount: toMinorUnits(raw.total),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    captured: raw.completed === true,
    customerId: accountId(raw.account),
    receiptEmail: raw.customer?.email ?? undefined,
    receiptUrl: raw.invoiceUrl ?? undefined,
    description: fullName(raw.customer?.first, raw.customer?.last),
    gateway: 'fastspring',
    metadata: strMap({
      reference: raw.reference,
      buyerReference: raw.buyerReference,
      live: raw.live,
      tax: raw.tax,
      subtotal: raw.subtotal,
      discount: raw.discount,
      totalDisplay: raw.totalDisplay,
      paymentType: raw.payment?.type,
      cardEnding: raw.payment?.cardEnding,
      itemCount: raw.items?.length,
    }),
    raw,
  }
}
