/**
 * Transform one row of the Faveo Helpdesk v3 user list into the canonical Contact.
 *
 * Source: GET v3/user-export-data — https://developers.faveohelpdesk.com/get-users-list/
 * ("Description : Fetches list of users"). A documented row:
 *   user_name: '<a href="http://localhost:8000/user/4">alan@gmail.com</a>'
 *   email: "alan@gmail.com"  id: 4  first_name: "Alan"  last_name: "Walker"
 *   country_code: "+91"  mobile: "9876543210"  name: "<a href=...>Alan Walker</a>"
 *   organizations: "--"  roles: "User, Organization User"  full_name: "Alan Walker"
 *   meta_name: "Alan Walker <alan@gmail.com>"  email_verified: true  mobile_verified: true
 *
 * `user_name` and `name` are rendered HTML links, so the plain `full_name` is
 * the name. `organizations` is display text, not an id, so organizationId is
 * left unset.
 */
import { z } from 'zod'
import type { Contact } from '../../../schema'

export interface RawFaveoUserRow {
  id: number
  full_name: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  country_code?: string | null
  mobile?: string | null
  roles?: string | null
  organizations?: string | null
  user_name?: string | null
  name?: string | null
  meta_name?: string | null
  view_url?: string | null
  edit_url?: string | null
  email_verified?: boolean | null
  mobile_verified?: boolean | null
}

const Email = z.email()

export function transformContact(raw: RawFaveoUserRow): Contact {
  if (typeof raw.full_name !== 'string') {
    throw new Error(`faveo-helpdesk: user ${raw.id} has no full_name`)
  }
  const email = Email.safeParse(raw.email).success ? (raw.email as string) : undefined
  const metadata: Record<string, string> = {}
  if (raw.roles) metadata['roles'] = raw.roles
  if (raw.country_code) metadata['countryCode'] = raw.country_code
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ...(email ? { email } : {}),
    name: raw.full_name,
    ...(raw.mobile ? { phone: raw.mobile } : {}),
    platform: 'faveo-helpdesk',
    metadata,
    raw,
  }
}
