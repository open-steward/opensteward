import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface PennylaneAccount {
  id: string
  number: string
  label: string
  enabled: boolean
  [key: string]: unknown
}

function mapType(number: string): AccountType {
  const prefix = number.charAt(0)
  if (prefix === '1') return 'LIABILITY'
  if (prefix === '2' || prefix === '3' || prefix === '4' || prefix === '5') return 'ASSET'
  if (prefix === '6') return 'EXPENSE'
  if (prefix === '7') return 'INCOME'
  return 'OTHER'
}

export function transformAccount(raw: PennylaneAccount): Account {
  const status: AccountStatus = raw.enabled ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.id,
    customerDefinedCode: raw.number || undefined,
    name: raw.label || undefined,
    type: mapType(raw.number ?? ''),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
