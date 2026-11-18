import type { Account } from '../../../schema/account'

export interface SuperfakturaAccount {
  id: string | number
  number?: string
  name?: string
  type?: string
  currency?: string
  balance?: number
  [key: string]: unknown
}

export function transformAccount(raw: SuperfakturaAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.number || undefined,
    currency: raw.currency || undefined,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
