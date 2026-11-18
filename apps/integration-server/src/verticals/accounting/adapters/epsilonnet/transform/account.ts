import type { Account, AccountType } from '../../../schema/account'
import { parseDecimal } from '../../shared/transform'

export interface EpsilonNetAccount {
  id: string | number
  code: string
  description: string
  accountType: string
  balance: number | string
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

export function transformAccount(raw: EpsilonNetAccount): Account {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.accountType),
    balance: parseDecimal(raw.balance),
    status: 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
