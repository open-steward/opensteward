/**
 * Transform Eudonet contact rows (Tab 200) to canonical Contact.
 *
 * Key Eudonet field DescIds for contacts (table 200):
 *   201 — LastName
 *   202 — FirstName
 *   203 — Email
 *   204 — Phone
 *   205 — Mobile
 *   206 — Title / Job title
 *   207 — Company (linked record ID)
 *   290 — CreatedAt (ISO 8601)
 *   291 — UpdatedAt (ISO 8601)
 */

import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'
import type { EudonetRow } from '../client'
import { fieldValue } from '../client'
import {
  FIELD_CONTACT_LASTNAME,
  FIELD_CONTACT_FIRSTNAME,
  FIELD_CONTACT_EMAIL,
  FIELD_CONTACT_PHONE,
  FIELD_CONTACT_MOBILE,
  FIELD_CONTACT_TITLE,
  FIELD_CONTACT_COMPANY_ID,
  FIELD_CONTACT_CREATED_AT,
  FIELD_CONTACT_UPDATED_AT,
} from '../constants'

export function transformContact(row: EudonetRow): Contact {
  const lastName  = fieldValue(row, FIELD_CONTACT_LASTNAME)
  const firstName = fieldValue(row, FIELD_CONTACT_FIRSTNAME)
  const nameParts = [firstName, lastName].filter(Boolean)

  return {
    id:         String(row.FileId),
    first_name: firstName,
    last_name:  lastName,
    name:       nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email:      fieldValue(row, FIELD_CONTACT_EMAIL),
    phone:      fieldValue(row, FIELD_CONTACT_PHONE),
    mobile:     fieldValue(row, FIELD_CONTACT_MOBILE),
    title:      fieldValue(row, FIELD_CONTACT_TITLE),
    company_id: fieldValue(row, FIELD_CONTACT_COMPANY_ID),
    created_at: toIsoDatetime(fieldValue(row, FIELD_CONTACT_CREATED_AT)),
    updated_at: toIsoDatetime(fieldValue(row, FIELD_CONTACT_UPDATED_AT)),
    metadata:   row as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): { DescId: number; Value: unknown }[] {
  const fields: { DescId: number; Value: unknown }[] = []
  if (data.last_name  !== undefined) fields.push({ DescId: FIELD_CONTACT_LASTNAME,   Value: data.last_name })
  if (data.first_name !== undefined) fields.push({ DescId: FIELD_CONTACT_FIRSTNAME,  Value: data.first_name })
  if (data.email      !== undefined) fields.push({ DescId: FIELD_CONTACT_EMAIL,      Value: data.email })
  if (data.phone      !== undefined) fields.push({ DescId: FIELD_CONTACT_PHONE,      Value: data.phone })
  if (data.mobile     !== undefined) fields.push({ DescId: FIELD_CONTACT_MOBILE,     Value: data.mobile })
  if (data.title      !== undefined) fields.push({ DescId: FIELD_CONTACT_TITLE,      Value: data.title })
  if (data.company_id !== undefined) fields.push({ DescId: FIELD_CONTACT_COMPANY_ID, Value: data.company_id })
  return fields
}
