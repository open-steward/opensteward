/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Account, AccountType } from '../../../schema/account'

export interface TallyAccount {
  NAME: string
  PARENT: string
  OPENINGBALANCE: string
  ISCOSTCENTRESACTIVATED?: string
  [key: string]: unknown
}

function mapType(parent: string): AccountType {
  const p = parent.toLowerCase()
  if (p.includes('income')) return 'INCOME'
  if (p.includes('expense')) return 'EXPENSE'
  if (p.includes('assets')) return 'ASSET'
  if (p.includes('liabilities')) return 'LIABILITY'
  if (p.includes('capital')) return 'EQUITY'
  return 'OTHER'
}

export function transformAccount(raw: TallyAccount): Account {
  const balance = parseFloat(raw.OPENINGBALANCE)

  return {
    id: raw.NAME,
    name: raw.NAME,
    customerDefinedCode: raw.NAME,
    type: mapType(raw.PARENT),
    status: 'ACTIVE',
    balance: isNaN(balance) ? undefined : balance,
    metadata: raw as Record<string, unknown>,
  }
}
