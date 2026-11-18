/**
 * Totango user (POST /api/v1/search/users hit) → canonical Contact.
 *
 * Search API (accounts and users):
 *   "name":"moris@123.com", "display_name":"moris@123.com",
 *   "Note that the user name and id along with the account name and account-id
 *    are always returned as well."
 * https://support.totango.com/hc/en-us/articles/204174135-Search-API-accounts-and-users
 *
 * `name` is the user id (the accounts sample labels `name` "account-id", and the
 * users sample has the same shape). The sample's id looks like an email, but
 * the docs never say it is one, so it is not mapped to `email`. The sample
 * shows no field for the account the user belongs to, so `company_id` is left
 * out.
 */

import type { Contact } from '../../../schema/contact'
import type { TotangoUserHit } from '../client'

export type RawTotangoUser = TotangoUserHit

export function transformContact(raw: RawTotangoUser): Contact {
  if (typeof raw.name !== 'string' || raw.name === '') {
    throw Object.assign(new Error('Totango user hit has no user id (`name`)'), { statusCode: 502 })
  }
  const out: Contact = { id: raw.name, metadata: raw }
  if (typeof raw.display_name === 'string' && raw.display_name !== '') out.name = raw.display_name
  return out
}
