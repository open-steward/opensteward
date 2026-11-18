import type { Account, AccountType } from '../../../schema/account'

export interface SageAccount {
  id: string
  display_name?: string
  nominal_code?: string
  account_type?: { name?: string }
  is_visible?: boolean
  [key: string]: unknown
}

function mapAccountType(typeName?: string): AccountType | undefined {
  switch (typeName) {
    case 'ASSET': return 'ASSET'
    case 'LIABILITY': return 'LIABILITY'
    case 'EQUITY': return 'EQUITY'
    case 'INCOME': return 'INCOME'
    case 'EXPENSE': return 'EXPENSE'
    default: return 'unknown'
  }
}

export function transformAccount(raw: SageAccount): Account {
  return {
    id: raw.id,
    name: raw.display_name || undefined,
    customerDefinedCode: raw.nominal_code || undefined,
    type: mapAccountType(raw.account_type?.name),
    status: raw.is_visible !== false ? 'ACTIVE' : 'ARCHIVED',
    metadata: raw as Record<string, unknown>,
  }
}
