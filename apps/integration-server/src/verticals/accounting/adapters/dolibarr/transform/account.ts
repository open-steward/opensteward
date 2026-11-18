import type { Account, AccountType } from '../../../schema/account'

export interface DolibarrAccount {
  rowid?: number | string
  id?: number | string
  ref?: string
  label?: string
  type?: number | string
  active?: number | string
  balance?: number
  [key: string]: unknown
}

function mapAccountType(type?: number | string): AccountType | undefined {
  const t = Number(type)
  switch (t) {
    case 1:
      return 'ASSET'
    case 2:
      return 'LIABILITY'
    case 3:
      return 'EQUITY'
    case 4:
      return 'INCOME'
    case 5:
      return 'EXPENSE'
    default:
      return undefined
  }
}

export function transformAccount(raw: DolibarrAccount): Account {
  const id = raw.rowid ?? raw.id
  return {
    id: id !== undefined ? String(id) : raw.ref ?? '',
    name: raw.label || undefined,
    customerDefinedCode: raw.ref || undefined,
    type: mapAccountType(raw.type),
    status: raw.active !== 0 ? 'ACTIVE' : 'ARCHIVED',
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
