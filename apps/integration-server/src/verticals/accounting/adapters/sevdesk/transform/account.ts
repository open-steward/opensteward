import type { Account } from '../../../schema/account'

export interface SevDeskAccount {
  id: string
  name: string
  number: string
  type: string
  status: string
  [key: string]: unknown
}

export function transformAccount(raw: SevDeskAccount): Account {
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.number || undefined,
    status: raw.status === '100' ? 'ACTIVE' : 'ARCHIVED',
    metadata: raw as Record<string, unknown>,
  }
}
