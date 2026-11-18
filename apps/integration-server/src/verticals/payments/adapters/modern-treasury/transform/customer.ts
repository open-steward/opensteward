import type { Customer } from '../../../schema/customer'

/**
 * A Modern Treasury counterparty, the documented fields this transform reads.
 * Source: the `counterparty` schema in the vendor's OpenAPI
 * (github.com/Modern-Treasury/modern-treasury-openapi, openapi/mt_openapi_spec_v1.yaml),
 * returned by `GET /api/counterparties` and `GET /api/counterparties/{id}`.
 */
export interface RawModernTreasuryCounterparty {
  id: string
  object?: string
  /** "A human friendly name for this counterparty." (nullable) */
  name?: string | null
  /** "The counterparty's email." (nullable) */
  email?: string | null
  /** "Additional data represented as key-value pairs. Both the key and value must be strings." */
  metadata?: Record<string, string>
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawModernTreasuryCounterparty): Customer {
  if (typeof raw.id !== 'string' || raw.id === '')
    throw new Error('Modern Treasury counterparty has no id')
  return {
    id: raw.id,
    externalId: raw.id,
    email: raw.email ?? undefined,
    name: raw.name ?? undefined,
    gateway: 'modern-treasury',
    metadata: { ...(raw.metadata ?? {}) },
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
