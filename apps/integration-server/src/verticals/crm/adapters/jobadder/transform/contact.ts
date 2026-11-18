/**
 * JobAdder Candidate ↔ canonical Contact.
 *
 * JobAdder is an ATS — the primary "person" record is a Candidate.
 * We map GET /candidates / GET /candidates/{candidateId} responses here.
 *
 * API fields (camelCase on the wire):
 *   candidateId, firstName, lastName, email, phone, mobile,
 *   address.{ street, city, state, postalCode, country },
 *   status.{ statusId, name }, recruiter.{ userId, name },
 *   createdAt, updatedAt
 */

import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawJobAdderCandidate {
  candidateId: number | string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  mobile?: string
  address?: {
    street?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    [key: string]: unknown
  }
  status?: {
    statusId?: number | string
    name?: string
    [key: string]: unknown
  }
  recruiter?: {
    userId?: number | string
    name?: string
    [key: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawJobAdderCandidate): Contact {
  const firstName = raw.firstName ?? undefined
  const lastName = raw.lastName ?? undefined
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined

  return {
    id: String(raw.candidateId),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    mobile: raw.mobile ?? undefined,
    stage: raw.status?.name ?? undefined,
    owner_id: raw.recruiter?.userId != null ? String(raw.recruiter.userId) : undefined,
    address: raw.address
      ? {
          line1: raw.address.street ?? undefined,
          city: raw.address.city ?? undefined,
          region: raw.address.state ?? undefined,
          postalCode: raw.address.postalCode ?? undefined,
          country: raw.address.country ?? undefined,
        }
      : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.address) {
    out.address = {
      street: data.address.line1,
      city: data.address.city,
      state: data.address.region,
      postalCode: data.address.postalCode,
      country: data.address.country,
    }
  }
  return out
}
