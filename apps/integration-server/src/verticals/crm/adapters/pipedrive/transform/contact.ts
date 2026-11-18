import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'
import { transformAddressV2, type RawPipedriveV2Address } from './company'

export interface RawPipedriveContact {
  id: number
  first_name?: string
  last_name?: string
  name?: string
  email?: Array<{ value: string; primary?: boolean; label?: string }>
  phone?: Array<{ value: string; primary?: boolean; label?: string }>
  org_id?: { value: number; name?: string } | null
  owner_id?: { id: number; name?: string } | null
  label?: string
  add_time?: string
  update_time?: string
  [key: string]: unknown
}

function primaryValue(
  arr: Array<{ value: string; primary?: boolean }> | undefined,
): string | undefined {
  if (!arr || arr.length === 0) return undefined
  const primary = arr.find((e) => e.primary)
  return (primary ?? arr[0])?.value || undefined
}

export function transformContact(raw: RawPipedriveContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: raw.name,
    email: primaryValue(raw.email),
    phone: primaryValue(raw.phone),
    company_id: raw.org_id?.value != null ? String(raw.org_id.value) : undefined,
    owner_id: raw.owner_id?.id != null ? String(raw.owner_id.id) : undefined,
    created_at: raw.add_time,
    updated_at: raw.update_time,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.email = [{ value: data.email, primary: true }]
  if (data.phone !== undefined) out.phone = [{ value: data.phone, primary: true }]
  if (data.company_id !== undefined) out.org_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}

// ── API v2 ──────────────────────────────────────────────────────────────────

/**
 * A person as `GET /api/v2/persons` and `GET /api/v2/persons/{id}` return it
 * (https://developers.pipedrive.com/docs/api/v2/openapi.yaml, getPersons /
 * getPerson). Only the fields the transform reads are typed; the rest stay in
 * `metadata`. v2 drops the related objects v1 nested (`org_id: { value }`,
 * `owner_id: { id }`) for plain integer ids, renames `email`/`phone` to
 * `emails`/`phones`, and returns RFC 3339 timestamps.
 */
export interface RawPipedriveV2Person {
  /** "The ID of the person" */
  id: number
  /** "The name of the person" */
  name?: string
  /** "The first name of the person" */
  first_name?: string
  /** "The last name of the person" */
  last_name?: string
  /** "The ID of the user who owns the person" */
  owner_id?: number | null
  /** "The ID of the organization linked to the person" */
  org_id?: number | null
  /** "The creation date and time of the person" */
  add_time?: string
  /** "The last updated date and time of the person" (nullable) */
  update_time?: string | null
  /** "The emails of the person" */
  emails?: Array<{ value: string; primary?: boolean; label?: string }>
  /** "The phones of the person" */
  phones?: Array<{ value: string; primary?: boolean; label?: string }>
  /** "The job title of the person, included if contact sync is enabled for the company" */
  job_title?: string | null
  /** "Postal address of the person, included if contact sync is enabled for the company" */
  postal_address?: RawPipedriveV2Address | null
  [key: string]: unknown
}

export function transformContactV2(raw: RawPipedriveV2Person): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: raw.name,
    email: primaryValue(raw.emails),
    phone: primaryValue(raw.phones),
    title: raw.job_title ?? undefined,
    company_id: raw.org_id != null ? String(raw.org_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    address: transformAddressV2(raw.postal_address),
    created_at: toIsoDatetime(raw.add_time),
    updated_at: toIsoDatetime(raw.update_time),
    metadata: raw,
  }
}
