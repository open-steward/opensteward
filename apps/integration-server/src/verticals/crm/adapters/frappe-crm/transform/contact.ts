/**
 * Transform Frappe CRM Lead → canonical Contact.
 *
 * Frappe CRM stores contacts as "CRM Lead" documents. The key fields are:
 *   name          — the Frappe document name (unique ID, e.g. "CRM-LEAD-2024-00001")
 *   first_name    — given name
 *   last_name     — family name
 *   lead_name     — full name (derived)
 *   email         — primary email
 *   mobile_no     — mobile phone
 *   phone         — alternate phone
 *   job_title     — job title
 *   organization  — company name (plain text on lead)
 *   lead_owner    — linked User
 *   status        — linked CRM Lead Status
 *   source        — linked CRM Lead Source
 *   creation      — ISO datetime
 *   modified      — ISO datetime
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

export interface RawFrappeLead {
  name: string
  first_name?: string
  last_name?: string
  lead_name?: string
  email?: string
  mobile_no?: string
  phone?: string
  job_title?: string
  organization?: string
  lead_owner?: string
  status?: string
  source?: string
  creation?: string
  modified?: string
  [key: string]: unknown
}

export function transformContact(raw: RawFrappeLead): Contact {
  const firstName = raw.first_name ?? undefined
  const lastName = raw.last_name ?? undefined
  const fullName =
    raw.lead_name ??
    ([firstName, lastName].filter(Boolean).join(' ') || undefined)

  return {
    id: String(raw.name),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: raw.email ?? undefined,
    phone: raw.mobile_no ?? raw.phone ?? undefined,
    mobile: raw.mobile_no ?? undefined,
    title: raw.job_title ?? undefined,
    owner_id: raw.lead_owner ?? undefined,
    stage: raw.status ?? undefined,
    created_at: toIsoDatetime(raw.creation),
    updated_at: toIsoDatetime(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.mobile !== undefined) out.mobile_no = data.mobile
  if (data.phone !== undefined) out.phone = data.phone
  if (data.title !== undefined) out.job_title = data.title
  if (data.owner_id !== undefined) out.lead_owner = data.owner_id
  if (data.stage !== undefined) out.status = data.stage
  return out
}
