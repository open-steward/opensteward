/**
 * OTTO Market Return → canonical Refund.
 *
 * `GET /v3/returns` (filterable by return state) and the
 * `POST .../acceptance` / `POST .../rejection` decision endpoints are
 * confirmed to exist, with confirmed accept-reason, reject-reason and
 * condition enums — but the public docs page shows no worked JSON example
 * for a return list item, so its field names are inferred from the one
 * naming convention OTTO Market DOES confirm elsewhere: the sibling
 * `/v2/returns-warehouse/addresses` resource keys its records
 * `returnAddressId`, i.e. `<resource>Id`. `returnId` is read on that same
 * convention, with `id` as a secondary fallback; if neither is present the
 * transform throws rather than fabricate an identifier `refund.id` and
 * downstream sync tracking depend on. `orderId` is required too and used
 * for joins, so it gets the identical treatment: `salesOrderId`/`orderId`
 * or a thrown error — never a placeholder like `'unknown'`, which would
 * make every un-linkable refund collide on the same fake foreign key.
 *
 * Returns are buyer-initiated (the buyer files the return; the seller only
 * accepts or rejects it), so `createRefund` is not implemented — see
 * index.ts.
 *
 * Docs: https://api.otto.market/docs/functional-interfaces/returns
 *       https://api.otto.market/docs/functional-interfaces/returns-warehouse
 */

import type { Refund } from '../../../schema/refund'

export interface RawOttoReturn {
  returnId?: string
  id?: string
  salesOrderId?: string
  orderId?: string
  sku?: string
  quantity?: number
  reason?: string
  acceptReason?: string
  rejectReason?: string
  returnState?: string
  state?: string
  createdDate?: string
  [key: string]: unknown
}

export function transformRefund(raw: RawOttoReturn): Refund {
  const id = raw.returnId ?? raw.id
  if (id == null) {
    throw new Error(
      'OTTO Market transformRefund: response had neither `returnId` nor `id` — ' +
        'cannot build a stable Refund.id from this payload.',
    )
  }
  const orderId = raw.salesOrderId ?? raw.orderId
  if (orderId == null) {
    throw new Error(
      `OTTO Market transformRefund: return ${id} has neither salesOrderId nor orderId — ` +
        'cannot build a stable Refund.orderId from this payload.',
    )
  }
  return {
    id,
    orderId,
    reason: raw.reason ?? raw.acceptReason ?? raw.rejectReason,
    refundLineItems:
      raw.sku != null
        ? [{ lineItemId: raw.sku, quantity: raw.quantity ?? 0 }]
        : undefined,
    createdAt: raw.createdDate,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
