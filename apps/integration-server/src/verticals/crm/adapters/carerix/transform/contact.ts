/**
 * Transform Carerix CREmployee records to/from the canonical Contact type.
 *
 * Carerix field names (JSON API, Accept: application/json):
 *   employeeID, firstName, lastName, emailAddress, phoneNumber,
 *   mobilePhoneNumber, toUserFunctionDescription (job title),
 *   toCompany (nested company ref with .id), dateCreated, dateModified
 */

import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCarerixEmployee {
  /** Platform-assigned record ID. */
  employeeID?: string | number
  /** May also appear as `id` depending on API version. */
  id?: string | number
  firstName?: string
  lastName?: string
  /** Primary email address. */
  emailAddress?: string
  /** Landline / primary phone. */
  phoneNumber?: string
  /** Mobile phone. */
  mobilePhoneNumber?: string
  /** Job title as a free-text field. */
  toUserFunctionDescription?: string
  /** Linked company object — may be an ID string or a nested object. */
  toCompany?: string | { id?: string | number; [key: string]: unknown } | null
  /** ISO-8601 or Carerix date-string of record creation. */
  dateCreated?: string
  /** ISO-8601 or Carerix date-string of last modification. */
  dateModified?: string
  [key: string]: unknown
}

/** Extract the company ID from either a string ref or a nested object. */
function extractCompanyId(
  toCompany: RawCarerixEmployee['toCompany'],
): string | undefined {
  if (!toCompany) return undefined
  if (typeof toCompany === 'string') return toCompany || undefined
  const id = toCompany.id
  return id != null ? String(id) : undefined
}

export function transformContact(raw: RawCarerixEmployee): Contact {
  const id = raw.employeeID ?? raw.id
  const firstName = raw.firstName ?? undefined
  const lastName = raw.lastName ?? undefined
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined

  return {
    id: String(id ?? ''),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: raw.emailAddress ?? undefined,
    phone: raw.phoneNumber ?? undefined,
    mobile: raw.mobilePhoneNumber ?? undefined,
    title: raw.toUserFunctionDescription ?? undefined,
    company_id: extractCompanyId(raw.toCompany),
    created_at: toIsoDatetime(raw.dateCreated),
    updated_at: toIsoDatetime(raw.dateModified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.emailAddress = data.email
  if (data.phone !== undefined) out.phoneNumber = data.phone
  if (data.mobile !== undefined) out.mobilePhoneNumber = data.mobile
  if (data.title !== undefined) out.toUserFunctionDescription = data.title
  if (data.company_id !== undefined) out.toCompany = data.company_id
  return out
}
