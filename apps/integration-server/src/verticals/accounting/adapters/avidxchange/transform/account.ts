/**
 * AvidXchange GL account transform → canonical Account.
 *
 * Key GL account fields (camelCase on the wire):
 *   glAccountId, glAccountCode, description, accountType, isActive,
 *   parentId, createdDate, modifiedDate
 */
import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface AvidXchangeGLAccount {
  glAccountId: string
  glAccountCode?: string
  description?: string
  accountType?: string
  isActive?: boolean
  parentId?: string
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function mapAccountType(accountType?: string): AccountType | undefined {
  switch ((accountType ?? '').toUpperCase()) {
    case 'ASSET':
      return 'ASSET'
    case 'LIABILITY':
      return 'LIABILITY'
    case 'EQUITY':
      return 'EQUITY'
    case 'INCOME':
    case 'REVENUE':
      return 'INCOME'
    case 'EXPENSE':
    case 'EXPENSES':
      return 'EXPENSE'
    default:
      return accountType ? 'OTHER' : undefined
  }
}

export function transformAccount(raw: AvidXchangeGLAccount): Account {
  const status: AccountStatus = raw.isActive === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.glAccountId,
    name: raw.description || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.glAccountCode || undefined,
    type: mapAccountType(raw.accountType),
    status,
    parentId: raw.parentId || undefined,
    createdAt: raw.createdDate ? new Date(raw.createdDate) : undefined,
    updatedAt: raw.modifiedDate ? new Date(raw.modifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
