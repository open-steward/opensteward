import { z } from 'zod'
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Respond.io `Contact`, as returned by GET /contact/{identifier} and in the
 * `items` of POST /contact/list.
 *
 * Docs: https://developers.respond.io/docs/api/cab9510b2994a-contact
 *       https://developers.respond.io/docs/api/cf79be21b1ccc-contact-fields
 *
 * Only documented fields are typed: `id` ("Contact ID", integer), the
 * ContactFields (`firstName` required, `lastName`, `phone`, `email`,
 * `language`, `profilePic`, `countryCode`, `custom_fields`), `status`
 * (open | closed | blocked, "Conversation status of the contact"), `tags`,
 * `assignee`, `lifecycle`, `created_at` (Unix seconds) and `isBlocked`.
 */
export interface RawRespondIoContact {
  id: number
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  email?: string | null
  language?: string | null
  profilePic?: string | null
  countryCode?: string | null
  custom_fields?: Array<{ name: string; value?: string | null }> | null
  status?: 'open' | 'closed' | 'blocked' | null
  tags?: string[]
  lifecycle?: string | null
  created_at?: number | null
  isBlocked?: boolean | null
  [key: string]: unknown
}

/**
 * The documented Contact `email` is a plain nullable `string` (no `format`),
 * while the canonical `email` is `z.email()`. A value that is not an email
 * stays in `raw` and is left out of the canonical field, so one malformed
 * address cannot fail a whole list page.
 */
const Email = z.email()

function canonicalEmail(v: unknown): string | undefined {
  const s = pickStr(v)
  return s !== undefined && Email.safeParse(s).success ? s : undefined
}

/**
 * ContactFields documents `firstName` as required, so the name always has a
 * documented source; if upstream omits both name fields the name is '' rather
 * than an invented stand-in such as the id.
 */
function fullName(raw: RawRespondIoContact): string {
  return [pickStr(raw.firstName)?.trim(), pickStr(raw.lastName)?.trim()]
    .filter((s): s is string => Boolean(s))
    .join(' ')
}

export function transformContact(raw: RawRespondIoContact): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: canonicalEmail(raw.email),
    name: fullName(raw),
    phone: pickStr(raw.phone),
    platform: 'respond-io',
    metadata: strMap({
      language: raw.language,
      profilePic: raw.profilePic,
      countryCode: raw.countryCode,
      status: raw.status,
      lifecycle: raw.lifecycle,
    }),
    raw,
  }
}
