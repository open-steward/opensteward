import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface BillyAccount {
  id: string
  name: string
  description: string
  accountNo: number
  groupId: string
  natureId: string
  isArchived: boolean
  isBankAccount: boolean
  isPaymentEnabled: boolean
  currencyId: string
  [key: string]: unknown
}

function mapType(acc: BillyAccount): AccountType {
  if (acc.isBankAccount) return 'ASSET'
  const nature = acc.natureId?.toLowerCase() ?? ''
  if (nature.includes('asset')) return 'ASSET'
  if (nature.includes('liabilit')) return 'LIABILITY'
  if (nature.includes('equity')) return 'EQUITY'
  if (nature.includes('revenue') || nature.includes('income')) return 'INCOME'
  if (nature.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: BillyAccount): Account {
  const status: AccountStatus = raw.isArchived ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.accountNo ? String(raw.accountNo) : undefined,
    type: mapType(raw),
    status,
    group: raw.groupId || undefined,
    isPayable: raw.isPaymentEnabled || undefined,
    currency: raw.currencyId || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
