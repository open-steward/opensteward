import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

/** PayU order buyer block. */
export interface RawPayuBuyer {
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  language?: string
  [k: string]: unknown
}

/** PayU order product line. */
export interface RawPayuProduct {
  name?: string
  unitPrice?: string | number
  quantity?: string | number
  [k: string]: unknown
}

/**
 * A PayU order as returned by `GET /api/v2_1/orders/{orderId}` (inside the
 * `orders[]` array) and echoed by `POST /api/v2_1/orders` on create.
 */
export interface RawPayuOrder {
  orderId?: string
  extOrderId?: string
  orderCreateDate?: string
  status?: string
  totalAmount?: string | number
  currencyCode?: string
  description?: string
  notifyUrl?: string
  customerIp?: string
  merchantPosId?: string | number
  buyer?: RawPayuBuyer
  products?: RawPayuProduct[]
  [k: string]: unknown
}

/**
 * Map a PayU order status to a canonical charge status.
 *   NEW / PENDING / WAITING_FOR_CONFIRMATION → pending
 *   COMPLETED                                → succeeded
 *   CANCELED                                 → cancelled
 *   REJECTED                                 → failed
 */
function mapStatus(raw: RawPayuOrder): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'COMPLETED':
      return 'succeeded'
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled'
    case 'REJECTED':
      return 'failed'
    case 'NEW':
    case 'PENDING':
    case 'WAITING_FOR_CONFIRMATION':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawPayuOrder): Charge {
  const id = pickStr(raw.orderId) ?? pickStr(raw.extOrderId) ?? ''
  const meta: Record<string, unknown> = {
    extOrderId: raw.extOrderId,
    merchantPosId: raw.merchantPosId,
    payuStatus: raw.status,
  }
  if (raw.buyer?.firstName || raw.buyer?.lastName) {
    meta.buyerName = [raw.buyer.firstName, raw.buyer.lastName].filter(Boolean).join(' ')
  }
  if (raw.buyer?.phone) meta.buyerPhone = raw.buyer.phone

  return {
    id,
    externalId: pickStr(raw.extOrderId) ?? id,
    amount: toMinorUnits(raw.totalAmount),
    currency: pickCurrency(raw.currencyCode),
    status: mapStatus(raw),
    description: raw.description ?? undefined,
    receiptEmail: raw.buyer?.email ?? undefined,
    gateway: 'payu',
    metadata: strMap(meta),
    createdAt: toIsoDatetime(raw.orderCreateDate),
    raw,
  }
}

/**
 * Build a PayU `OrderCreateRequest` body from a partial canonical charge.
 * `merchantPosId` is supplied by the adapter (it lives on the stored
 * credentials, not on the canonical charge).
 */
export function untransformCharge(
  c: Partial<Charge>,
  merchantPosId: string,
): Record<string, unknown> {
  const description = c.description ?? `Order ${c.externalId ?? c.id ?? ''}`.trim()
  const out: Record<string, unknown> = {
    merchantPosId,
    currencyCode: (c.currency ?? 'PLN').toUpperCase(),
    totalAmount: String(c.amount ?? 0),
    description,
    // PayU requires at least one product line; synthesise one from the charge.
    products: [
      {
        name: description || 'Payment',
        unitPrice: String(c.amount ?? 0),
        quantity: '1',
      },
    ],
  }
  if (c.externalId) out.extOrderId = c.externalId
  if (c.receiptEmail) out.buyer = { email: c.receiptEmail }
  return out
}
