import type { Contact } from '../../../schema/contact'

/**
 * Vitally REST API user object shape.
 *
 * Vitally calls end-users "Users". They map to CRM contacts.
 * Docs: https://docs.vitally.io/en/articles/9880661-rest-api-users
 */
export interface RawVitallyUser {
  id: string
  externalId?: string | null
  name?: string | null
  email?: string | null
  avatar?: string | null
  accountIds?: string[]
  traits?: Record<string, unknown>
  createdAt?: string | null
  updatedAt?: string | null
  firstKnown?: string | null
  lastSeenTimestamp?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawVitallyUser): Contact {
  const nameParts = (typeof raw.name === 'string' ? raw.name : '').split(' ').filter(Boolean)
  return {
    id: String(raw.id),
    first_name: nameParts.length > 0 ? nameParts[0] : undefined,
    last_name: nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined,
    name: typeof raw.name === 'string' && raw.name ? raw.name : undefined,
    email: typeof raw.email === 'string' ? raw.email : undefined,
    company_id:
      Array.isArray(raw.accountIds) && raw.accountIds.length > 0
        ? String(raw.accountIds[0])
        : undefined,
    created_at: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updated_at: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.email = data.email
  return out
}
