/**
 * LogiCommerce return → canonical Refund.
 *
 * Sources (https://api-sync.logicommerce.cloud/docs/reference.cfm?module=sales&languageId=2):
 * GET /orders/{id}/returns, "Returns information on the returns of an order."
 * (`"returns": [ … ]`), and GET /returns/{id}, "Returns the data of the stated
 * return by its internal identifier." Both document a return as a sales
 * document with `ID` and `DATE`.
 *
 * The id is `<orderId>:<return ID>`: the order comes from the request path,
 * because no documented return field names its order. No amount is mapped:
 * the document carries two currencies (`CURRENCIES.SOURCE`,
 * `CURRENCIES.DESTINATION`) without saying which one its totals are in.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Refund } from '../../../schema/refund'
import { requireId } from '../languages'

export interface RawLogicommerceReturn {
  DATE?: string
  ID?: number
  [key: string]: unknown
}

export function transformLogicommerceReturn(raw: RawLogicommerceReturn, orderId: string): Refund {
  const returnId = requireId('return', raw.ID)
  const out: Refund = { id: `${orderId}:${returnId}`, orderId, metadata: { ...raw } }
  const createdAt = toIsoDatetime(raw.DATE)
  if (createdAt) out.createdAt = createdAt
  return out
}
