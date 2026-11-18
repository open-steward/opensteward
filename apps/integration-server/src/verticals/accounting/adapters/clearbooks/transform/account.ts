import type { Account, AccountType } from '../../../schema/account'
import { parseDecimal } from '../../shared/transform'

export interface ClearBooksAccount {
  account_id: string | number
  account_code: string
  account_name: string
  account_type: string
  balance: number | string
  is_active: boolean
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  const t = (type ?? '').toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue') || t.includes('sales')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: ClearBooksAccount): Account {
  return {
    id: String(raw.account_id),
    name: raw.account_name || undefined,
    customerDefinedCode: raw.account_code || undefined,
    type: mapAccountType(raw.account_type),
    balance: parseDecimal(raw.balance),
    status: raw.is_active === false ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
