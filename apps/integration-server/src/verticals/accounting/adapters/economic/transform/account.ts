import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface EconomicAccount {
  accountNumber: number
  name: string
  accountType: string
  debitCredit: string
  barred: boolean
  balance: number
  accountGroup: { accountGroupNumber: number; name: string } | null
  vatAccount: { vatCode: string } | null
  [key: string]: unknown
}

function mapType(accountType: string): AccountType {
  const t = accountType?.toLowerCase() ?? ''
  if (t === 'profitandloss' || t === 'profit_and_loss') return 'INCOME'
  if (t === 'status' || t === 'balance') return 'ASSET'
  if (t.includes('heading') || t.includes('total')) return 'OTHER'
  return 'OTHER'
}

export function transformAccount(raw: EconomicAccount): Account {
  const status: AccountStatus = raw.barred ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.accountNumber),
    name: raw.name || undefined,
    customerDefinedCode: String(raw.accountNumber),
    type: mapType(raw.accountType),
    status,
    group: raw.accountGroup?.name || undefined,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
