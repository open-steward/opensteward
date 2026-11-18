import type { Account, AccountType } from '../../../schema/account'
import { parseDecimal } from '../../shared/transform'

export interface CmicAccount {
  AccountId: string
  AccountCode: string
  AccountName: string
  AccountType: string
  Balance: number | string
  IsActive: boolean
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  const t = (type ?? '').toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: CmicAccount): Account {
  return {
    id: String(raw.AccountId),
    name: raw.AccountName || undefined,
    customerDefinedCode: raw.AccountCode || undefined,
    type: mapAccountType(raw.AccountType),
    balance: parseDecimal(raw.Balance),
    status: raw.IsActive ? 'ACTIVE' : 'ARCHIVED',
    metadata: raw as Record<string, unknown>,
  }
}
