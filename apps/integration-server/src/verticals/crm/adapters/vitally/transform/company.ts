import type { Company } from '../../../schema/company'

/**
 * Vitally REST API account object shape.
 *
 * Vitally calls organisations "Accounts". They map to CRM companies.
 * Docs: https://docs.vitally.io/en/articles/9880654-rest-api-accounts
 */
export interface RawVitallyAccount {
  id: string
  externalId?: string | null
  name?: string | null
  traits?: Record<string, unknown>
  organizationId?: string | null
  accountOwnerId?: string | null
  mrr?: number | null
  healthScore?: number | null
  npsScore?: number | null
  usersCount?: number | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawVitallyAccount): Company {
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name : '',
    owner_id: typeof raw.accountOwnerId === 'string' ? raw.accountOwnerId : undefined,
    created_at: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updated_at: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  return out
}
