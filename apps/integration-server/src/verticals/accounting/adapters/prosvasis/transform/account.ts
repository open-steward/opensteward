import type { Account, AccountType } from '../../../schema/account'
import { parseDecimal } from '../../shared/transform'

export interface ProsvasisAccount {
  id: string | number
  Code: string
  Name: string
  Type: string
  Balance: number | string
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

export function transformAccount(raw: ProsvasisAccount): Account {
  return {
    id: String(raw.id),
    name: raw.Name || undefined,
    customerDefinedCode: raw.Code || undefined,
    type: mapAccountType(raw.Type),
    balance: parseDecimal(raw.Balance),
    status: 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
