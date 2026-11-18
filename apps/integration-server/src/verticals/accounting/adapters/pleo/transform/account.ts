/**
 * Transform Pleo chart-of-accounts account to canonical Account.
 *
 * Pleo API: GET /accounts, GET /accounts/{accountId}
 * Response fields: id, name, accountNumber, accountCategoryId, taxCodeId, hidden
 *
 * Docs: https://developers.pleo.io/reference/accounts/chart-of-accounts-api-overview
 */

import type { Account } from '../../../schema/account'

export interface PleoAccount {
  id: string
  name: string
  accountNumber?: string
  accountCategoryId?: string
  taxCodeId?: string
  hidden?: boolean
  [key: string]: unknown
}

export function transformAccount(raw: PleoAccount): Account {
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.accountNumber || undefined,
    // Pleo accounts have no explicit type; map to OTHER (they represent CoA entries)
    type: 'OTHER',
    status: raw.hidden ? 'ARCHIVED' : 'ACTIVE',
    metadata: raw as Record<string, unknown>,
  }
}
