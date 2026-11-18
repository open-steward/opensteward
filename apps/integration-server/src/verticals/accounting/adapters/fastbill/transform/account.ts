import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface FastbillAccount {
  ACCOUNT_ID: string
  ACCOUNT_CODE: string
  ACCOUNT_NAME: string
  ACCOUNT_TYPE: string
  IS_ACTIVE: boolean
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  switch (type) {
    case 'asset': return 'ASSET'
    case 'liability': return 'LIABILITY'
    case 'equity': return 'EQUITY'
    case 'income': return 'INCOME'
    case 'expense': return 'EXPENSE'
    default: return 'OTHER'
  }
}

export function transformAccount(raw: FastbillAccount): Account {
  const status: AccountStatus = raw.IS_ACTIVE ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: String(raw.ACCOUNT_ID),
    name: raw.ACCOUNT_NAME || undefined,
    customerDefinedCode: raw.ACCOUNT_CODE || undefined,
    type: mapAccountType(raw.ACCOUNT_TYPE),
    status,
    metadata: raw as Record<string, unknown>,
  }
}

export type FastBillAccount = FastbillAccount
