/**
 * OroCRM account ↔ canonical Company transform.
 *
 * In OroCRM, "Account" is the CRM entity for companies/organisations.
 * JSON:API resource type: `accounts`
 *
 * Key attributes (GET /api/accounts):
 *   name, phone, shippingAddress (object), owner,
 *   createdAt, updatedAt
 *
 * Relationships: owner → User
 */
import type { Company } from '../../../schema/company'
import type { JsonApiRecord } from '../client'
import { strAttr, relId } from './shared'

export function transformCompany(record: JsonApiRecord): Company {
  return {
    id: String(record.id),
    name: strAttr(record, 'name') ?? '',
    phone: strAttr(record, 'phone'),
    owner_id: relId(record, 'owner'),
    created_at: strAttr(record, 'createdAt'),
    updated_at: strAttr(record, 'updatedAt'),
    metadata: { id: record.id, type: record.type, attributes: record.attributes, relationships: record.relationships },
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (data.name !== undefined) attributes['name'] = data.name
  if (data.phone !== undefined) attributes['phone'] = data.phone
  return {
    data: {
      type: 'accounts',
      attributes,
    },
  }
}
