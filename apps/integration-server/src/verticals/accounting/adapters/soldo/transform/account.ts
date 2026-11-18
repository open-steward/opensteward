/**
 * Soldo wallet → canonical Account.
 *
 * Soldo wallets represent named spending pots with their own balance and currency.
 * Endpoint: GET /business/v2/wallets, GET /business/v2/wallets/{walletId}
 *
 * Known wallet fields:
 *   id, name, type (main | company | employee | dedicated),
 *   currency, balance (available balance), status (ACTIVE | INACTIVE | ...),
 *   customreferenceId, groupId
 */

import type { Account, AccountType } from '../../../schema/account'

export interface SoldoWallet {
  id: string
  name?: string
  type?: string
  currency?: string
  balance?: number
  status?: string
  customreferenceId?: string
  groupId?: string
  [key: string]: unknown
}

function mapWalletType(_type?: string): AccountType {
  // All Soldo wallet types are asset-class (spending) accounts
  return 'ASSET'
}

function mapStatus(status?: string): 'ACTIVE' | 'ARCHIVED' {
  if (!status) return 'ACTIVE'
  const s = status.toUpperCase()
  if (s === 'INACTIVE' || s === 'ARCHIVED' || s === 'CLOSED') return 'ARCHIVED'
  return 'ACTIVE'
}

/**
 * Convert a Soldo major-unit decimal amount to canonical integer minor units.
 * Soldo returns amounts as decimals (e.g. 100.50 EUR). The canonical Amount
 * schema requires integer minor units (e.g. 10050 for €100.50).
 */
function toMinorUnits(amount: number | undefined | null): number | undefined {
  if (amount == null) return undefined
  return Math.round(amount * 100)
}

export function transformWallet(raw: SoldoWallet): Account {
  return {
    id: raw.id,
    name: raw.name ?? undefined,
    type: mapWalletType(raw.type),
    status: mapStatus(raw.status),
    currency: raw.currency ?? undefined,
    balance: toMinorUnits(raw.balance),
    metadata: raw as Record<string, unknown>,
  }
}
