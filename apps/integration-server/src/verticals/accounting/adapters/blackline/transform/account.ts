import type { Account, AccountType } from '../../../schema/account'
import { parseDecimal } from '../../shared/transform'

export interface BlacklineAccount {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string
  balance: number | string
  isActive: boolean
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  const t = (type ?? '').toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: BlacklineAccount): Account {
  return {
    id: String(raw.accountId),
    name: raw.accountName || undefined,
    customerDefinedCode: raw.accountCode || undefined,
    type: mapAccountType(raw.accountType),
    balance: parseDecimal(raw.balance),
    status: raw.isActive ? 'ACTIVE' : 'ARCHIVED',
    metadata: raw as Record<string, unknown>,
  }
}
