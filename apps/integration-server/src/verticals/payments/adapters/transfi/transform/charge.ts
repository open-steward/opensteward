import type { Charge, ChargeStatus } from '../../../schema/charge'
import { orderSideMoney, strMap, type RawTransfiOrderSide } from './shared'

/**
 * A v3 order row with `orderType` / `type` `payin` — a collection.
 *
 * Fields as documented by List Orders (`data.transfers[]`:
 * https://docs.transfi.com/reference/list-orders.md) and Get Order by ID
 * (`data`: https://docs.transfi.com/reference/get-order.md). List rows name
 * the order type `orderType`; Get Order names it `type`.
 */
export interface RawTransfiOrder {
  id?: string
  status?: string
  orderType?: string
  type?: string
  source?: RawTransfiOrderSide
  destination?: RawTransfiOrderSide
  userId?: string
  partnerContext?: Record<string, unknown>
  failureCode?: string
  failureMessage?: string
  createdAt?: string
  updatedAt?: string
  [k: string]: unknown
}

/**
 * Payin statuses from https://docs.transfi.com/docs/webhook-events-payin.md:
 * `initiated`, `fund_settled` ("Payment Authorised"), `fund_failed`
 * ("Payment Unauthorised"), `manual_review`, and `asset_settled` for crypto
 * payins ("User has mad e the payment").
 */
function mapStatus(s: string | undefined): ChargeStatus {
  switch (s) {
    case 'initiated':
    case 'manual_review':
      return 'pending'
    case 'fund_settled':
    case 'asset_settled':
      return 'succeeded'
    case 'fund_failed':
      return 'failed'
    default:
      return 'unknown'
  }
}

/**
 * The payer's side is `source` ("Collect payment … TransFi returns a hosted
 * payment link for making the payment", orderType `payin`), so the charge
 * amount is `source.amount` in `source.currency`.
 */
export function transformCharge(raw: RawTransfiOrder): Charge {
  const id = raw.id
  if (!id) throw new Error('TransFi order has no id')
  const { amount, currency } = orderSideMoney(id, 'source', raw.source)
  return {
    id,
    externalId: id,
    amount,
    currency,
    status: mapStatus(raw.status),
    ...(raw.userId ? { customerId: raw.userId } : {}),
    ...(raw.failureCode ? { failureCode: raw.failureCode } : {}),
    ...(raw.failureMessage ? { failureMessage: raw.failureMessage } : {}),
    gateway: 'transfi',
    metadata: strMap(raw.partnerContext),
    ...(raw.createdAt ? { createdAt: raw.createdAt } : {}),
    ...(raw.updatedAt ? { updatedAt: raw.updatedAt } : {}),
    raw,
  }
}
