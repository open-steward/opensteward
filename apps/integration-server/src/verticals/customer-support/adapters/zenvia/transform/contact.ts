/**
 * Maps a Zenvia Customer Cloud Prospect to the canonical Contact schema.
 *
 * Prospects are the Zenvia CRM entity for end-customers / leads.
 *
 * API: GET /prospects  /  GET /prospect/{prospectId}
 * Docs: https://sales.zenvia.com/#tag/Prospects
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZenviaProspect {
  id: string
  firstName?: string | null
  lastName?: string | null
  phones?: string[] | null
  emails?: string[] | null
  groupId?: string | null
  status?: string | null
  category?: string | null
  additionalData?: Record<string, unknown> | null
  [key: string]: unknown
}

function buildName(raw: RawZenviaProspect): string {
  const first = pickStr(raw.firstName) ?? ''
  const last = pickStr(raw.lastName) ?? ''
  return [first, last].filter(Boolean).join(' ')
}

export function transformContact(raw: RawZenviaProspect): Contact {
  const email = raw.emails?.[0]
  const phone = raw.phones?.[0]
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(email),
    name: buildName(raw) || String(raw.id),
    phone: pickStr(phone),
    platform: 'zenvia',
    metadata: strMap({
      status: raw.status,
      category: raw.category,
    }),
    raw,
  }
}
