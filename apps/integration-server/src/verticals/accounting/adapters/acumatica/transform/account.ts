import type { Account, AccountType } from '../../../schema/account'

export interface AcumaticaAccount {
  AccountID: string
  AccountCD: string
  Description: string
  Type: string
  Active: boolean
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  const t = (type ?? '').toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue') || t.includes('sales')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: AcumaticaAccount): Account {
  return {
    id: String(raw.AccountID),
    name: raw.Description || undefined,
    customerDefinedCode: raw.AccountCD || undefined,
    type: mapAccountType(raw.Type),
    status: raw.Active === false ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
