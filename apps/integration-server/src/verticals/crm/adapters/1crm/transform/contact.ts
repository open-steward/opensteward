/**
 * Transform 1CRM Contact records to/from the canonical Contact schema.
 *
 * 1CRM field names (from GET /api.php/data/Contact):
 *   id, first_name, last_name, salutation, email1, phone_work, phone_mobile,
 *   title, department, primary_account_id, assigned_user_id,
 *   date_entered, date_modified
 */

import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'

export interface Raw1CrmContact {
  id: string
  first_name?: string
  last_name?: string
  salutation?: string
  email1?: string
  phone_work?: string
  phone_mobile?: string
  title?: string
  department?: string
  primary_account_id?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformContact(raw: Raw1CrmContact): Contact {
  const firstName = raw.first_name ?? undefined
  const lastName = raw.last_name ?? undefined
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined

  return {
    id: String(raw.id),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: raw.email1 ?? undefined,
    phone: raw.phone_work ?? undefined,
    mobile: raw.phone_mobile ?? undefined,
    title: raw.title ?? undefined,
    company_id: raw.primary_account_id ?? undefined,
    owner_id: raw.assigned_user_id ?? undefined,
    created_at: toIsoDatetime(raw.date_entered),
    updated_at: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email1 = data.email
  if (data.phone !== undefined) out.phone_work = data.phone
  if (data.mobile !== undefined) out.phone_mobile = data.mobile
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.primary_account_id = data.company_id
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  return out
}
