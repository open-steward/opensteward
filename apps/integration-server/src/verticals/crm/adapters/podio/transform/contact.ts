import type { Contact } from '../../../schema/contact'
import type { PodioItem } from '../client'
import { getFieldValue, getRelationId, buildFields } from './helpers'
import { CONTACT_FIELDS } from '../constants'

export function transformContact(raw: PodioItem): Contact {
  const f = raw.fields
  const firstName = getFieldValue(f, CONTACT_FIELDS.FIRST_NAME)
  const lastName = getFieldValue(f, CONTACT_FIELDS.LAST_NAME)
  return {
    id: String(raw.item_id),
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || undefined,
    email: getFieldValue(f, CONTACT_FIELDS.EMAIL),
    phone: getFieldValue(f, CONTACT_FIELDS.PHONE),
    title: getFieldValue(f, CONTACT_FIELDS.TITLE),
    company_id: getRelationId(f, CONTACT_FIELDS.COMPANY),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const pairs: Array<[string, Array<Record<string, unknown>>]> = []
  if (data.first_name !== undefined)
    pairs.push([CONTACT_FIELDS.FIRST_NAME, [{ value: data.first_name }]])
  if (data.last_name !== undefined)
    pairs.push([CONTACT_FIELDS.LAST_NAME, [{ value: data.last_name }]])
  if (data.email !== undefined)
    pairs.push([CONTACT_FIELDS.EMAIL, [{ value: data.email }]])
  if (data.phone !== undefined)
    pairs.push([CONTACT_FIELDS.PHONE, [{ value: data.phone }]])
  if (data.title !== undefined)
    pairs.push([CONTACT_FIELDS.TITLE, [{ value: data.title }]])
  return { fields: buildFields(pairs) }
}
