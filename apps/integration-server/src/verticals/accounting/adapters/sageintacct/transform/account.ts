import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface IntacctAccount {
  RECORDNO: string
  ACCOUNTNO: string
  TITLE: string
  ACCOUNTTYPE: string
  STATUS: 'active' | 'inactive'
  NORMALBALANCE: 'debit' | 'credit'
  [key: string]: unknown
}

function mapType(raw: IntacctAccount): AccountType {
  if (raw.ACCOUNTTYPE === 'incomestatement') {
    return raw.NORMALBALANCE === 'credit' ? 'INCOME' : 'EXPENSE'
  }
  if (raw.ACCOUNTTYPE === 'balancesheet') {
    const firstDigit = raw.ACCOUNTNO.charAt(0)
    if (firstDigit === '1') return 'ASSET'
    if (firstDigit === '2') return 'LIABILITY'
    if (firstDigit === '3') return 'EQUITY'
  }
  return 'OTHER'
}

export function transformAccount(raw: IntacctAccount): Account {
  const status: AccountStatus = raw.STATUS === 'active' ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.RECORDNO,
    name: raw.TITLE || undefined,
    customerDefinedCode: raw.ACCOUNTNO || undefined,
    type: mapType(raw),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
