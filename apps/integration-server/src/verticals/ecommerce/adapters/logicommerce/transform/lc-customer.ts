/**
 * LogiCommerce account → canonical Customer.
 *
 * Source: GET /accounts and GET /accounts/{id}
 * (https://api-sync.logicommerce.cloud/docs/reference.cfm?module=accounts&languageId=2).
 * Documented example: `"DATEADDED" :"2019-08-24T14:15:22Z", "ID" : 123,
 * "INVOICINGADDRESS": { "ADDRESS", "CITY", "COMPANY", "FIRSTNAME", "LASTNAME",
 * "MOBILE", "PHONE", … }, "MASTER": { "EMAIL", "FIRSTNAME", "LASTNAME", … }`.
 * The `addedFrom` filter reads DATEADDED as the creation date: "The returned
 * items must have been created on the specified date or later."
 *
 * The person fields come from the account's MASTER (its master registered
 * user). The email is kept only when it is an address: the documented
 * example's placeholder is `"string"`.
 */
import { z } from 'zod'
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { requireId } from '../languages'

export interface RawLogicommerceAccount {
  DATEADDED?: string
  ID?: number
  INVOICINGADDRESS?: { PHONE?: string; [key: string]: unknown }
  MASTER?: { EMAIL?: string; FIRSTNAME?: string; LASTNAME?: string; [key: string]: unknown }
  [key: string]: unknown
}

const Email = z.email()

export function transformLogicommerceAccount(raw: RawLogicommerceAccount): Customer {
  const id = requireId('account', raw.ID)
  const out: Customer = { id, metadata: { ...raw } }
  const master = raw.MASTER
  if (master) {
    if (typeof master.EMAIL === 'string' && Email.safeParse(master.EMAIL).success) {
      out.email = master.EMAIL
    }
    if (typeof master.FIRSTNAME === 'string' && master.FIRSTNAME !== '')
      out.firstName = master.FIRSTNAME
    if (typeof master.LASTNAME === 'string' && master.LASTNAME !== '')
      out.lastName = master.LASTNAME
  }
  const phone = raw.INVOICINGADDRESS?.PHONE
  if (typeof phone === 'string' && phone !== '') out.phone = phone
  const createdAt = toIsoDatetime(raw.DATEADDED)
  if (createdAt) out.createdAt = createdAt
  return out
}
