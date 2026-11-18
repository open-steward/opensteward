/**
 * BoondManager contact ↔ canonical Contact transform.
 *
 * BoondManager contacts are returned as JSON:API items.
 * The `attributes` object uses camelCase field names.
 *
 * Key attributes:
 *   firstName, lastName, email1, phone1, title, city, country
 *   mainManager (relationship id), company (relationship id)
 *   creationDate, updateDate — ISO 8601 strings from the API
 */

import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'
import type { JsonApiItem } from '../client'

/** Raw BoondManager contact attributes as returned by the API. */
export interface RawBoondManagerContact extends JsonApiItem {
  attributes: {
    firstName?: string
    lastName?: string
    email1?: string
    phone1?: string
    phone2?: string
    title?: string
    city?: string
    country?: string
    state?: number
    note?: string
    creationDate?: string
    updateDate?: string
    [key: string]: unknown
  }
  relationships?: {
    company?: { data?: { id?: string; type?: string } | null }
    mainManager?: { data?: { id?: string; type?: string } | null }
    [key: string]: unknown
  }
}

export function transformContact(raw: RawBoondManagerContact): Contact {
  const a = raw.attributes ?? {}
  const rels = raw.relationships ?? {}

  const firstName = a.firstName as string | undefined
  const lastName = a.lastName as string | undefined
  const nameParts = [firstName, lastName].filter(Boolean)

  const companyId =
    (rels.company as { data?: { id?: string } | null } | undefined)?.data?.id

  const ownerId =
    (rels.mainManager as { data?: { id?: string } | null } | undefined)?.data?.id

  return {
    id: String(raw.id),
    first_name: firstName ?? undefined,
    last_name: lastName ?? undefined,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: (a.email1 as string | undefined) ?? undefined,
    phone: (a.phone1 as string | undefined) ?? undefined,
    title: (a.title as string | undefined) ?? undefined,
    company_id: companyId ?? undefined,
    owner_id: ownerId ?? undefined,
    created_at: toIsoDatetime(a.creationDate),
    updated_at: toIsoDatetime(a.updateDate),
    metadata: { id: raw.id, type: raw.type, ...a, relationships: rels },
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out['firstName'] = data.first_name
  if (data.last_name !== undefined) out['lastName'] = data.last_name
  if (data.email !== undefined) out['email1'] = data.email
  if (data.phone !== undefined) out['phone1'] = data.phone
  if (data.title !== undefined) out['title'] = data.title
  return out
}
