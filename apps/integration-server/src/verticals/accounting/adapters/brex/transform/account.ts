/**
 * Transform Brex cash-account records to the canonical Account type.
 *
 * Endpoint: GET /v2/accounts/cash
 *
 * Brex response item shape:
 * {
 *   id: string
 *   description: string
 *   status: "ACTIVE" | "ARCHIVED"
 *   account_number: string
 *   routing_number: string
 *   current_balance:   { amount: number; currency: string }
 *   available_balance: { amount: number; currency: string }
 *   primary?: boolean
 * }
 *
 * Amounts are in minor units (cents) per the Brex API convention.
 */

import type { Account } from '../../../schema/account'

export interface BrexBalance {
  amount: number
  currency: string
}

export interface BrexCashAccount {
  id: string
  description?: string
  status: 'ACTIVE' | 'ARCHIVED'
  account_number?: string
  routing_number?: string
  current_balance?: BrexBalance
  available_balance?: BrexBalance
  primary?: boolean
  [key: string]: unknown
}

export function transformAccount(raw: BrexCashAccount): Account {
  return {
    id: raw.id,
    name: raw.description || undefined,
    description: raw.description || undefined,
    type: 'ASSET',
    status: raw.status === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVED',
    currency: raw.current_balance?.currency || raw.available_balance?.currency || undefined,
    // Use available_balance as the canonical balance (liquid funds)
    balance: raw.available_balance?.amount ?? raw.current_balance?.amount ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
