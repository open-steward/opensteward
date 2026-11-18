/**
 * lemlist Contact transform.
 *
 * lemlist /contacts response shape:
 *   _id, teamId, fullName, email, fields (custom), campaigns, ownerId,
 *   createdAt, createdBy, unsubscribed
 *
 * The `fields` object may include firstName, lastName, phone, linkedinUrl,
 * companyName, companyDomain, picture, jobTitle.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

export interface RawLemlistContact {
  _id: string
  teamId?: string
  fullName?: string
  email?: string
  ownerId?: string
  createdAt?: string
  unsubscribed?: boolean
  fields?: {
    firstName?: string
    lastName?: string
    phone?: string
    linkedinUrl?: string
    companyName?: string
    companyDomain?: string
    picture?: string
    jobTitle?: string
    [key: string]: unknown
  }
  campaigns?: Array<{
    campaignId?: string
    campaignState?: string
    leadState?: string
    leadId?: string
  }>
  [key: string]: unknown
}

export function transformContact(raw: RawLemlistContact): Contact {
  const fields = raw.fields ?? {}
  const firstName = fields.firstName as string | undefined
  const lastName = fields.lastName as string | undefined
  const nameParts = [firstName, lastName].filter(Boolean)
  const fullName =
    nameParts.length > 0 ? nameParts.join(' ') : (raw.fullName ?? undefined)

  return {
    id: String(raw._id),
    first_name: firstName ?? undefined,
    last_name: lastName ?? undefined,
    name: fullName,
    email: raw.email ?? undefined,
    phone: (fields.phone as string | undefined) ?? undefined,
    title: (fields.jobTitle as string | undefined) ?? undefined,
    owner_id: raw.ownerId ? String(raw.ownerId) : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.email !== undefined) out.email = data.email
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.title !== undefined) out.jobTitle = data.title
  return out
}
