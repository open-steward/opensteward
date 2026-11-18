/**
 * Orderchamp Order transform — read (+ `orderCancel`).
 *
 * `isFulfilled` is a confirmed field/filter name ("by passing the
 * isFulfilled: false parameter" —
 * https://developers.orderchamp.com/manage-orders-fulfilment) and drives
 * `fulfillmentStatus` here. Orderchamp's own order lifecycle
 * (`OrderStatus`) does not map cleanly onto the canonical schema's separate
 * financial/fulfillment axes — the only status value literally quoted in
 * the docs is `AWAITING_DELIVERY` ("the order.status should now be set to
 * AWAITING_DELIVERY"), not a full enum — so `financialStatus` is left unset
 * rather than guessed from an unconfirmed value set. The raw `status` is
 * still available to callers via `metadata`.
 *
 * There is no `orderCreate`/`orderUpdate` mutation in Orderchamp's schema at
 * all (only `ingestedOrderCreate`, a distinct dropshipping-ingestion
 * concept — see ../metadata.ts) — this adapter is read + cancel only.
 *
 * Docs: https://developers.orderchamp.com/manage-orders-fulfilment
 */
import type { Order } from '../../../schema/order'

export interface RawOrderchampOrder {
  id: string
  status?: string
  isFulfilled?: boolean | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformOrder(raw: RawOrderchampOrder): Order {
  return {
    id: String(raw.id),
    fulfillmentStatus: raw.isFulfilled == null ? undefined : raw.isFulfilled ? 'FULFILLED' : 'UNFULFILLED',
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
