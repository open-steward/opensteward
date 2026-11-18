import type { Customer } from '../../../schema/customer'

/**
 * A row of `data[]` from List Individual Users
 * (https://docs.transfi.com/reference/list-individual-users.md) or List
 * Business Users (https://docs.transfi.com/reference/list-business-users.md).
 */
export interface RawTransfiCustomer {
  userId?: string
  type?: string
  firstName?: string
  lastName?: string
  name?: string
  businessName?: string
  email?: string
  country?: string
  status?: string
  timestamps?: { userCreatedAt?: string; [k: string]: unknown }
  [k: string]: unknown
}

function displayName(raw: RawTransfiCustomer): string | undefined {
  if (raw.type === 'business') return raw.businessName || undefined
  const parts = [raw.firstName, raw.lastName].filter(
    (p): p is string => typeof p === 'string' && p !== '',
  )
  return parts.length ? parts.join(' ') : undefined
}

export function transformCustomer(raw: RawTransfiCustomer): Customer {
  const id = raw.userId
  if (!id) throw new Error('TransFi user has no userId')
  const name = displayName(raw)
  const metadata: Record<string, string> = {}
  if (raw.type) metadata.type = raw.type
  if (raw.status) metadata.status = raw.status
  return {
    id,
    externalId: id,
    ...(raw.email ? { email: raw.email } : {}),
    ...(name ? { name } : {}),
    gateway: 'transfi',
    metadata,
    ...(raw.timestamps?.userCreatedAt ? { createdAt: raw.timestamps.userCreatedAt } : {}),
    raw,
  }
}
