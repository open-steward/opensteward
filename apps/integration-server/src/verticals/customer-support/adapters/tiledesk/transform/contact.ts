/**
 * Tiledesk lead (contact) transform.
 *
 * Leads are end-users who initiated conversations.
 * GET /v3/:project_id/leads
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTiledeskLead {
  _id?: string
  lead_id?: string
  fullname?: string
  email?: string
  phone?: string | null
  company?: string | null
  city?: string | null
  country?: string | null
  id_project?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: string
  attributes?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformContact(raw: RawTiledeskLead): Contact {
  const id = pickStr(raw._id) ?? pickStr(raw.lead_id) ?? ''
  return {
    id,
    externalId: pickStr(raw.lead_id) ?? id,
    email: pickStr(raw.email),
    name: pickStr(raw.fullname) ?? '',
    phone: pickStr(raw.phone),
    platform: 'tiledesk',
    metadata: strMap({
      company: raw.company,
      city: raw.city,
      country: raw.country,
      createdAt: toIso(raw.createdAt),
    }),
    raw,
  }
}
