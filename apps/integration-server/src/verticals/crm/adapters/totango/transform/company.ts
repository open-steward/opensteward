/**
 * Totango account (POST /api/v1/search/accounts hit) → canonical Company.
 *
 * Search API (accounts and users):
 *   {"name":"19934", // account-id
 *    "display_name":"ACME Inc", //  account-name
 *   "Note that the account name and account-id are always returned as well."
 *   "Use the selected_fields array to retrieve the fields requested."
 * https://support.totango.com/hc/en-us/articles/204174135-Search-API-accounts-and-users
 *
 * The adapter requests no extra fields, so `selected_fields` carries nothing
 * to map; the whole hit is kept as metadata.
 */

import type { Company } from '../../../schema/company'
import type { TotangoAccountHit } from '../client'

export type RawTotangoAccount = TotangoAccountHit

function malformed(what: string): Error {
  return Object.assign(new Error(`Totango account hit has no ${what}`), { statusCode: 502 })
}

export function transformCompany(raw: RawTotangoAccount): Company {
  if (typeof raw.name !== 'string' || raw.name === '') throw malformed('account-id (`name`)')
  if (typeof raw.display_name !== 'string') throw malformed('account name (`display_name`)')
  return {
    id: raw.name,
    name: raw.display_name,
    metadata: raw,
  }
}
