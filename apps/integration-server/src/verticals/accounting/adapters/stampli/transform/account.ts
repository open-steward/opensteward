/**
 * Stampli GL account → canonical Account transform.
 *
 * Stampli exposes GL account codes used to code invoice line items.
 *
 * Wire shape (camelCase JSON):
 *   id, code, name, description, type, isActive, parentId,
 *   createdAt, updatedAt
 */
import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface StampliGLAccount {
  id: string
  code?: string
  name?: string
  description?: string
  type?: string
  isActive?: boolean
  parentId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapAccountType(type?: string): AccountType | undefined {
  switch ((type ?? '').toUpperCase()) {
    case 'ASSET':
    case 'ASSETS':
      return 'ASSET'
    case 'LIABILITY':
    case 'LIABILITIES':
      return 'LIABILITY'
    case 'EQUITY':
      return 'EQUITY'
    case 'INCOME':
    case 'REVENUE':
      return 'INCOME'
    case 'EXPENSE':
    case 'EXPENSES':
    case 'COST_OF_GOODS':
      return 'EXPENSE'
    default:
      return undefined
  }
}

export function transformAccount(raw: StampliGLAccount): Account {
  const status: AccountStatus = raw.isActive === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.code || undefined,
    type: mapAccountType(raw.type),
    status,
    parentId: raw.parentId || undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
