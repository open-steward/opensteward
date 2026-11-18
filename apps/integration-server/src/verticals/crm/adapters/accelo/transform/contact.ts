import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * Raw Accelo contact object as returned by GET /contacts or GET /contacts/{id}.
 *
 * Default fields: id, firstname, surname, email, phone, mobile, company, status,
 * date_created, date_modified.
 */
export interface RawAcceloContact {
  id: string | number
  firstname?: string
  surname?: string
  email?: string
  phone?: string
  mobile?: string
  /** company may be the company id (string/number) or an expanded object. */
  company?: string | number | { id: string | number; name?: string; [key: string]: unknown }
  status?: string | number | { id: string | number; title?: string; [key: string]: unknown }
  date_created?: string | number
  date_modified?: string | number
  [key: string]: unknown
}

function resolveCompanyId(
  company: RawAcceloContact['company'],
): string | undefined {
  if (company == null) return undefined
  if (typeof company === 'object') return String(company.id)
  return String(company)
}

export function transformContact(raw: RawAcceloContact): Contact {
  const firstName = raw.firstname ?? undefined
  const lastName = raw.surname ?? undefined
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined

  return {
    id: String(raw.id),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    mobile: raw.mobile ?? undefined,
    company_id: resolveCompanyId(raw.company),
    created_at: toIsoDatetime(raw.date_created),
    updated_at: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.surname = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.company_id !== undefined) out.company_id = data.company_id
  return out
}
