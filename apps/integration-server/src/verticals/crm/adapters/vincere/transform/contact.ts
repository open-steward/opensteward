/**
 * Vincere candidates → canonical Contact.
 *
 * Field names come from Vincere's OpenAPI spec, https://api.vincere.io/vapi.yaml.
 * A search item and a candidate detail are different shapes, so each has its
 * own transform:
 *
 * - GET /candidate/search/{matrix_vars} returns the `fl` fields requested, and
 *   "Only the fields that have value will be return". Documented fields read
 *   here: `id` "ID of candidate", `name` "Full name", `first_name`,
 *   `last_name`, `primary_email` "Primary email", `phone` "Phone", `mobile`
 *   "Mobile", `current_job_title` "Current job title",
 *   `current_employer_obj` "Basic company object (id + name) of current
 *   employer", `created_date` "Created date of candidate", `last_update`
 *   "Last update timestamp".
 * - GET /candidate/{id} ("Get a specific candidate.") returns `id`,
 *   `first_name`, `middle_name`, `last_name`, `email`, `phone`, `mobile`,
 *   `job_title`, `registration_date` and `updated_timestamp` among others.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/** The `fl` list the search asks for: exactly the fields read below. */
export const CANDIDATE_SEARCH_FIELDS = [
  'id',
  'name',
  'first_name',
  'last_name',
  'primary_email',
  'phone',
  'mobile',
  'current_job_title',
  'current_employer_obj',
  'created_date',
  'last_update',
] as const

export interface RawVincereCandidateSearchItem {
  id: number
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  primary_email?: string | null
  phone?: string | null
  mobile?: string | null
  current_job_title?: string | null
  current_employer_obj?: { id?: number | null; name?: string | null } | null
  created_date?: string | null
  last_update?: string | null
  [key: string]: unknown
}

/** GET /candidate/{id}. */
export interface RawVincereCandidate {
  id: number
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  job_title?: string | null
  registration_date?: string | null
  updated_timestamp?: string | null
  [key: string]: unknown
}

function text(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function requireId(raw: { id?: unknown }, what: string): string {
  if (typeof raw.id !== 'number' && typeof raw.id !== 'string') {
    throw new Error(`Vincere ${what} without an id`)
  }
  return String(raw.id)
}

export function transformCandidateSearchItem(raw: RawVincereCandidateSearchItem): Contact {
  const employer = raw.current_employer_obj?.id
  return {
    id: requireId(raw, 'candidate search item'),
    first_name: text(raw.first_name),
    last_name: text(raw.last_name),
    name: text(raw.name),
    email: text(raw.primary_email),
    phone: text(raw.phone),
    mobile: text(raw.mobile),
    title: text(raw.current_job_title),
    company_id: employer != null ? String(employer) : undefined,
    created_at: toIsoDatetime(raw.created_date),
    updated_at: toIsoDatetime(raw.last_update),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformContact(raw: RawVincereCandidate): Contact {
  const firstName = text(raw.first_name)
  const lastName = text(raw.last_name)
  const name = [firstName, text(raw.middle_name), lastName].filter(Boolean).join(' ')
  return {
    id: requireId(raw, 'candidate'),
    first_name: firstName,
    last_name: lastName,
    name: name || undefined,
    email: text(raw.email),
    phone: text(raw.phone),
    mobile: text(raw.mobile),
    title: text(raw.job_title),
    created_at: toIsoDatetime(raw.registration_date),
    updated_at: toIsoDatetime(raw.updated_timestamp),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.first_name !== undefined) body.first_name = data.first_name
  if (data.last_name !== undefined) body.last_name = data.last_name
  if (data.email !== undefined) body.email = data.email
  if (data.phone !== undefined) body.phone = data.phone
  if (data.mobile !== undefined) body.mobile_phone = data.mobile
  if (data.title !== undefined) body.job_title = data.title
  return body
}
