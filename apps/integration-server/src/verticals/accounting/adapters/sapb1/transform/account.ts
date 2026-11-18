/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Account, AccountType } from '../../../schema/account'

export interface SapB1Account {
  Code: string
  Name: string
  ExternalCode: string
  AcctCurrency: string
  Balance: number
  Frozen: 'tYES' | 'tNO'
  AccountType: string
  [key: string]: unknown
}

function mapAccountType(accountType: string): AccountType {
  switch (accountType) {
    case 'gt_Sales':
      return 'INCOME'
    case 'gt_Expenditure':
      return 'EXPENSE'
    case 'gt_Assets':
      return 'ASSET'
    case 'gt_Liability':
      return 'LIABILITY'
    case 'gt_Equity':
      return 'EQUITY'
    default:
      return 'OTHER'
  }
}

export function transformAccount(raw: SapB1Account): Account {
  return {
    id: raw.Code,
    name: raw.Name || undefined,
    customerDefinedCode: raw.ExternalCode || raw.Code,
    type: mapAccountType(raw.AccountType),
    status: raw.Frozen === 'tYES' ? 'ARCHIVED' : 'ACTIVE',
    currency: raw.AcctCurrency || undefined,
    balance: raw.Balance,
    metadata: raw as Record<string, unknown>,
  }
}
