import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface NetSuiteAccount {
  id?: string | number
  acctNumber?: string
  acctName?: string
  description?: string
  acctType?: string
  isInactive?: boolean
  balance?: number
  currency?: string
  [key: string]: unknown
}

function mapType(acctType: string | undefined): AccountType {
  const t = (acctType ?? '').toLowerCase()
  if (t.includes('bank') || t.includes('othercurrentasset') || t.includes('longtermliabilit') || t.includes('asset') || t.includes('deferredexpense')) return 'ASSET'
  if (t.includes('currentliabilit') || t.includes('credit') || t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue') || t.includes('otherincome')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: NetSuiteAccount): Account {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    customerDefinedCode: raw.acctNumber || undefined,
    name: raw.acctName || undefined,
    description: raw.description || undefined,
    type: mapType(raw.acctType),
    status: (raw.isInactive ? 'ARCHIVED' : 'ACTIVE') as AccountStatus,
    balance: raw.balance,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
