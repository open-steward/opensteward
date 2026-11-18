import type { Refund, RefundStatus } from '../../../schema/refund'
import { toIsoDatetime } from '@opensteward/shared'
import { toMinorUnits, pickCurrency, strMap } from './shared'

/**
 * FastSpring return (refund) object.
 *
 * Sourced from `POST /returns` response and from the `return.created`
 * webhook event payload. The `return` field is the unique return ID.
 * Financial amounts are in major units (e.g. `totalReturn: 29.99`).
 *
 * Docs: https://developer.fastspring.com/reference/returns
 *       https://developer.fastspring.com/docs/returncreated
 */
export interface RawFastspringReturn {
  return?: string
  reference?: string | null
  quote?: string | null
  completed?: boolean
  changed?: number
  changedInSeconds?: number
  changedDisplay?: string
  changedDisplayISO8601?: string
  live?: boolean
  currency?: string | null
  payoutCurrency?: string | null
  totalReturn?: number
  totalReturnDisplay?: string
  tax?: number
  subtotal?: number
  totalReturnInPayoutCurrency?: number
  totalRefundInPayoutCurrency?: number
  reason?: string | null
  note?: string | null
  type?: string | null
  refundPerformerType?: string | null
  refundSourceComponent?: string | null
  refundPerformer?: string | null
  account?: {
    id?: string
    account?: string
    contact?: {
      first?: string | null
      last?: string | null
      email?: string | null
    } | null
  } | string | null
  customer?: {
    first?: string | null
    last?: string | null
    email?: string | null
    company?: string | null
    phone?: string | null
  } | null
  payment?: { type?: string; cardEnding?: string } | null
  original?: {
    id?: string
    order?: string
    reference?: string | null
    total?: number
    totalDisplay?: string
  } | null
  items?: Array<{
    product?: string
    display?: string
    sku?: string | null
    quantity?: number
    subtotal?: number
    returnType?: string | null
  }>
  [k: string]: unknown
}

function mapStatus(raw: RawFastspringReturn): RefundStatus {
  if (raw.completed === true) return 'succeeded'
  return 'pending'
}

function accountId(account: RawFastspringReturn['account']): string | undefined {
  if (!account) return undefined
  if (typeof account === 'string') return account || undefined
  return account.id ?? account.account ?? undefined
}

export function transformRefund(raw: RawFastspringReturn): Refund {
  const id = String(raw.return ?? '')
  const originalOrderId =
    raw.original?.id ?? raw.original?.order ?? undefined

  return {
    id,
    externalId: String(raw.reference ?? raw.return ?? ''),
    chargeId: String(originalOrderId ?? ''),
    amount: toMinorUnits(raw.totalReturn),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    reason: undefined, // FastSpring reason is a free-text field; not a canonical enum
    gateway: 'fastspring',
    metadata: strMap({
      accountId: accountId(raw.account),
      reason: raw.reason,
      note: raw.note,
      type: raw.type,
      refundPerformerType: raw.refundPerformerType,
      refundSourceComponent: raw.refundSourceComponent,
      refundPerformer: raw.refundPerformer,
      live: raw.live,
      payoutCurrency: raw.payoutCurrency,
      totalReturnDisplay: raw.totalReturnDisplay,
      tax: raw.tax,
      subtotal: raw.subtotal,
      originalReference: raw.original?.reference,
      paymentType: raw.payment?.type,
      cardEnding: raw.payment?.cardEnding,
    }),
    createdAt: toIsoDatetime(raw.changed),
    updatedAt: toIsoDatetime(raw.changed),
    raw,
  }
}
