/**
 * LogiCommerce order → canonical Order.
 *
 * Sources (https://api-sync.logicommerce.cloud/docs/reference.cfm?module=sales&languageId=2):
 *  - GET /orders rows: `"DATE" :"2021-09-13T09:23:17+02:00", "DOCUMENTNUMBER"
 *    :"1122", "ID" : 606, "TOTAL" : 19.9675, "USER": { "ID" : 2966, … }, …`
 *  - GET /orders/{id}: the same `ID`, `DATE`, `DOCUMENTNUMBER`, plus
 *    `"COMMENT" :"Order comment"` and `"USER": { "EMAIL"
 *    :"info@logicommerce.com", … }`.
 *
 * No money is mapped. A list row's `TOTAL` comes with no currency, and the
 * full order documents two (`CURRENCIES.SOURCE` and `CURRENCIES.DESTINATION`)
 * without saying which one its amounts are in. `USER.ID` is a user id, not an
 * account id (customers are listed from GET /accounts), so it is not mapped
 * to `customerId`. Everything stays in `metadata`.
 */
import { z } from 'zod'
import { toIsoDatetime } from '@opensteward/shared'
import type { Order } from '../../../schema/order'
import { requireId } from '../languages'

export interface RawLogicommerceOrder {
  COMMENT?: string
  DATE?: string
  DOCUMENTNUMBER?: string
  ID?: number
  USER?: { EMAIL?: string; [key: string]: unknown }
  [key: string]: unknown
}

const Email = z.email()

export function transformLogicommerceOrder(raw: RawLogicommerceOrder): Order {
  const id = requireId('order', raw.ID)
  const out: Order = { id, metadata: { ...raw } }
  if (typeof raw.DOCUMENTNUMBER === 'string' && raw.DOCUMENTNUMBER !== '') {
    out.orderNumber = raw.DOCUMENTNUMBER
  }
  const createdAt = toIsoDatetime(raw.DATE)
  if (createdAt) out.createdAt = createdAt
  const email = raw.USER?.EMAIL
  if (typeof email === 'string' && Email.safeParse(email).success) out.email = email
  if (typeof raw.COMMENT === 'string' && raw.COMMENT !== '') out.note = raw.COMMENT
  return out
}
