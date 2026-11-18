import { Email, toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'
import { optionalId, optionalString, requireId } from '../fields'

/** `{ label, value }`, as the documented Person schema's emails/contact_numbers items. */
export interface RawKrayinLabelledValue {
  label?: string
  value?: string
}

/**
 * GET /api/v1/contacts/persons and /api/v1/contacts/persons/{id}.
 * Fields from krayin/rest-api src/Http/Resources/V1/Contact/PersonResource.php:
 * id, name, emails, contact_numbers, organization (when set), job_title,
 * sales_owner (a UserResource, when set), created_at, updated_at. The
 * documented `Person` schema gives emails as
 * `{"label": "work", "value": "example1@gmail.com"}` items.
 */
export interface RawKrayinContact {
  id?: number | string
  name?: string
  emails?: RawKrayinLabelledValue[] | null
  contact_numbers?: RawKrayinLabelledValue[] | null
  organization?: { id?: number | string; name?: string } | null
  job_title?: string | null
  sales_owner?: { id?: number | string; name?: string } | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawKrayinContact): Contact {
  const email = optionalString(raw.emails?.[0]?.value)
  return {
    id: requireId(raw.id, 'person'),
    // Krayin stores one `name`; it has no first/last split.
    name: optionalString(raw.name),
    email: email !== undefined && Email.safeParse(email).success ? email : undefined,
    phone: optionalString(raw.contact_numbers?.[0]?.value),
    title: optionalString(raw.job_title),
    company_id: optionalId(raw.organization?.id),
    owner_id: optionalId(raw.sales_owner?.id),
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out['first_name'] = data.first_name
  if (data.last_name !== undefined) out['last_name'] = data.last_name
  if (data.email !== undefined) out['emails'] = [{ value: data.email, label: 'work' }]
  if (data.phone !== undefined) out['contact_numbers'] = [{ value: data.phone, label: 'work' }]
  if (data.title !== undefined) out['job_title'] = data.title
  if (data.company_id !== undefined) out['organization_id'] = data.company_id
  return out
}
