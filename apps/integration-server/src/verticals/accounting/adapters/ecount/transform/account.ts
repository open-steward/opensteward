import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface EcountAccount {
  ACCOUNT_CODE: string
  ACCOUNT_NAME?: string
  ACCOUNT_TYPE?: string
  USE_YN?: string
  BALANCE?: number
  [key: string]: unknown
}

function mapAccountType(accountType?: string): AccountType | undefined {
  switch (accountType) {
    case '01':
      return 'ASSET'
    case '02':
      return 'LIABILITY'
    case '03':
      return 'EQUITY'
    case '04':
      return 'INCOME'
    case '05':
      return 'EXPENSE'
    default:
      return undefined
  }
}

export function transformAccount(raw: EcountAccount): Account {
  const status: AccountStatus = raw.USE_YN === 'Y' ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.ACCOUNT_CODE,
    name: raw.ACCOUNT_NAME || undefined,
    customerDefinedCode: raw.ACCOUNT_CODE,
    type: mapAccountType(raw.ACCOUNT_TYPE),
    status,
    balance: raw.BALANCE,
    metadata: raw as Record<string, unknown>,
  }
}
