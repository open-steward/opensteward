/**
 * Scopevisio impersonal account → canonical Account transform.
 *
 * Scopevisio field notes (ImpersonalAccountRow):
 *  - `number`      : account number (Kontonummer), e.g. "4000"
 *  - `name`        : account name (Kontoname)
 *  - `type`        : account type (Kontoart) – "ASSET", "LIABILITY", etc.
 *  - `category`    : account category (Kontokennzeichen)
 *  - `vatCode`     : VAT code (Steuerkennzeichen)
 *  - `vatKey`      : VAT key (Steuerschlüssel)
 *  - `deactivated` : boolean – true when the account is archived
 *  - `isFinanceAccount` : boolean
 *
 * List endpoint: POST /impersonalaccounts (returns { rows: ImpersonalAccountRow[] })
 *
 * Scopevisio does not expose individual account balances via this endpoint;
 * `balance` is therefore left unset.
 */

import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface ScopevisioImpersonalAccount {
  number?: string
  name?: string
  type?: string
  category?: string
  vatCode?: string
  vatKey?: string
  fixVatKey?: boolean
  deactivated?: boolean
  directPosting?: boolean
  discountAccount?: string
  isFinanceAccount?: boolean
  subjectToClearing?: boolean
  [key: string]: unknown
}

/** Maps Scopevisio account type strings to canonical AccountType. */
function mapType(raw?: string): AccountType | undefined {
  if (!raw) return undefined
  const t = raw.toUpperCase()
  if (t === 'ASSET' || t === 'AKTIVKONTO') return 'ASSET'
  if (t === 'LIABILITY' || t === 'PASSIVKONTO') return 'LIABILITY'
  if (t === 'EQUITY' || t === 'EIGENKAPITAL') return 'EQUITY'
  if (t === 'INCOME' || t === 'ERTRAGSKONTO' || t === 'ERLÖSKONTO') return 'INCOME'
  if (t === 'EXPENSE' || t === 'AUFWANDSKONTO') return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: ScopevisioImpersonalAccount): Account {
  const status: AccountStatus = raw.deactivated ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.number ?? undefined,
    name: raw.name || undefined,
    customerDefinedCode: raw.number || undefined,
    type: mapType(raw.type),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
