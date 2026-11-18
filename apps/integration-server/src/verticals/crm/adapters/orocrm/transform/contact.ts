/**
 * OroCRM contact ↔ canonical Contact transform.
 *
 * OroCRM JSON:API contact attributes (GET /api/contacts):
 *   firstName, lastName, salutation, jobTitle, description,
 *   birthday, primaryEmail (object with value), primaryPhone (object with value),
 *   primaryAddress (object with ...address fields)
 *
 * Relationships: account → Company, owner → User
 */
import type { Contact } from '../../../schema/contact'
import type { JsonApiRecord } from '../client'
import { strAttr, relId } from './shared'

/** OroCRM stores email as an object { value: string } or null. */
function emailAttr(record: JsonApiRecord, key: string): string | undefined {
  const v = record.attributes?.[key]
  if (!v) return undefined
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) {
    const email = (v as Record<string, unknown>)['value']
    return email != null ? String(email) : undefined
  }
  return undefined
}

/** OroCRM stores phone as an object { value: string } or null. */
function phoneAttr(record: JsonApiRecord, key: string): string | undefined {
  const v = record.attributes?.[key]
  if (!v) return undefined
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null) {
    const phone = (v as Record<string, unknown>)['value']
    return phone != null ? String(phone) : undefined
  }
  return undefined
}

export function transformContact(
  record: JsonApiRecord,
  accountId?: string,
): Contact {
  const firstName = strAttr(record, 'firstName')
  const lastName = strAttr(record, 'lastName')
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined

  return {
    id: String(record.id),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: emailAttr(record, 'primaryEmail'),
    phone: phoneAttr(record, 'primaryPhone'),
    title: strAttr(record, 'jobTitle'),
    company_id: accountId ?? relId(record, 'account'),
    owner_id: relId(record, 'owner'),
    created_at: strAttr(record, 'createdAt'),
    updated_at: strAttr(record, 'updatedAt'),
    metadata: { id: record.id, type: record.type, attributes: record.attributes, relationships: record.relationships },
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (data.first_name !== undefined) attributes['firstName'] = data.first_name
  if (data.last_name !== undefined) attributes['lastName'] = data.last_name
  if (data.email !== undefined) attributes['primaryEmail'] = { value: data.email }
  if (data.phone !== undefined) attributes['primaryPhone'] = { value: data.phone }
  if (data.title !== undefined) attributes['jobTitle'] = data.title
  return {
    data: {
      type: 'contacts',
      attributes,
    },
  }
}
