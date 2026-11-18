/**
 * Octopus → canonical Account transform.
 *
 * Octopus REST API endpoint: GET /generalAccounts, GET /generalAccounts/{id}
 *
 * Octopus exposes the general ledger chart of accounts (rekeningschema) via
 * the generalAccounts resource.  Account numbers follow the Belgian RGS
 * (Rekeningenstelsel) convention (e.g. 400000 = customers receivable).
 */

import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface OctopusAccount {
  accountId?: number
  accountNumber?: string
  description?: string
  shortDescription?: string
  active?: boolean
  balance?: number
  accountType?: string
  vatCode?: string
  [key: string]: unknown
}

function mapAccountType(raw?: string): AccountType | undefined {
  if (!raw) return undefined
  const t = raw.toUpperCase()
  if (t.includes('ASSET') || t.includes('ACTIVA') || t.includes('BEZIT')) return 'ASSET'
  if (t.includes('LIABILIT') || t.includes('PASSIVA') || t.includes('SCHULD')) return 'LIABILITY'
  if (t.includes('EQUITY') || t.includes('EIGEN')) return 'EQUITY'
  if (t.includes('INCOME') || t.includes('OPBRENGST') || t.includes('REVENUE')) return 'INCOME'
  if (t.includes('EXPENSE') || t.includes('KOST') || t.includes('CHARGE')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: OctopusAccount): Account {
  const status: AccountStatus = raw.active === false ? 'ARCHIVED' : 'ACTIVE'
  const code = raw.accountNumber || (raw.accountId !== undefined ? String(raw.accountId) : undefined)
  return {
    id: raw.accountId !== undefined ? String(raw.accountId) : code,
    name: raw.description || raw.shortDescription || undefined,
    customerDefinedCode: code,
    type: mapAccountType(raw.accountType),
    status,
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
