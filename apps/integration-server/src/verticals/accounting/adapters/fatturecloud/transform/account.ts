import type { Account } from '../../../schema/account'

export interface FattureCloudAccount {
  id?: number | string
  value?: number
  description?: string
  is_disabled?: boolean
  [key: string]: unknown
}

export function transformAccount(raw: FattureCloudAccount): Account {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.description || undefined,
    status: raw.is_disabled ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
