/**
 * Finix `Identity` ↔ canonical `Customer`.
 *
 * A Finix Identity represents a person or business. Buyer details live in the
 * `entity` sub-object (first_name/last_name/email/phone, business_name, and
 * personal/business addresses). We don't carry the address onto the canonical
 * Customer here (the canonical billing/shipping address comes from richer
 * sources) but we surface the business name in metadata for traceability.
 */
import type { Customer } from '../../../schema/customer'
import { iso, refId, strMap } from './shared'

export interface RawFinixIdentityEntity {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  business_name?: string | null
  doing_business_as?: string | null
  [k: string]: unknown
}

export interface RawFinixIdentity {
  id?: string
  application?: string
  entity?: RawFinixIdentityEntity | null
  tags?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawFinixIdentity): Customer {
  const entity = raw.entity ?? {}
  const personName = [entity.first_name, entity.last_name]
    .filter((p): p is string => Boolean(p))
    .join(' ')
    .trim()
  const name = entity.business_name || personName || undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: entity.email ?? undefined,
    name,
    phone: entity.phone ?? undefined,
    gateway: 'finix',
    metadata: strMap({
      ...(raw.tags ?? {}),
      application: refId(raw.application),
      business_name: entity.business_name,
      doing_business_as: entity.doing_business_as,
    }),
    createdAt: iso(raw.created_at),
    updatedAt: iso(raw.updated_at),
    raw,
  }
}
