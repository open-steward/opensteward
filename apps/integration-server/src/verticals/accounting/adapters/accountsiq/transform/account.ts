import type { Account, AccountType } from '../../../schema/account'
import { parseDecimal } from '../../shared/transform'

export interface AccountsIQAccount {
  accountId: string | number
  entityId: string | number
  accountCode: string
  accountName: string
  accountType: string
  balance: number | string
  isActive: boolean
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

export function transformAccount(raw: AccountsIQAccount): Account {
  return {
    id: String(raw.accountId),
    name: raw.accountName || undefined,
    customerDefinedCode: raw.accountCode || undefined,
    type: mapAccountType(raw.accountType),
    balance: parseDecimal(raw.balance),
    status: raw.isActive === false ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
