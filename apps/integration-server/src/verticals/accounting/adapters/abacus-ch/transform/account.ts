/**
 * Transform Abacus ERP general-ledger account records to the canonical Account schema.
 *
 * Abacus exposes GL accounts through the OData entity set "Accounts"
 * (sometimes "GLAccounts" depending on the Abacus version and API module).
 *
 * Key Abacus account fields:
 *   Id              – numeric string primary key
 *   AccountNumber   – chart-of-accounts number (e.g. "1000")
 *   Name            – account description/name
 *   AccountType     – Abacus account class string
 *   IsActive        – boolean
 *   Balance         – current balance (decimal, NOT minor units)
 *   CurrencyCode    – ISO 4217
 *   ParentId        – parent account numeric id for hierarchical charts
 *   CreatedAt / ModifiedAt – ISO datetime strings
 */

import type { Account, AccountType } from '../../../schema/account'

// ── Abacus payload type ───────────────────────────────────────────────────────

export interface AbacusAccount {
  Id: string | number
  AccountNumber?: string
  Name?: string
  Description?: string
  AccountType?: string
  IsActive?: boolean
  Balance?: number
  CurrencyCode?: string
  ParentId?: string | number
  CreatedAt?: string
  ModifiedAt?: string
  [key: string]: unknown
}

// ── Account type mapping ──────────────────────────────────────────────────────
// Abacus uses German ERP terminology for account classes.

const ABACUS_TYPE_MAP: Record<string, AccountType> = {
  // Asset classes
  Asset: 'ASSET',
  Aktivkonto: 'ASSET',           // "Asset account" (German)
  Umlaufvermögen: 'ASSET',       // Current assets
  Anlagevermögen: 'ASSET',       // Fixed assets
  Bank: 'ASSET',
  Cash: 'ASSET',
  Debtors: 'ASSET',
  AccountsReceivable: 'ASSET',
  // Liability classes
  Liability: 'LIABILITY',
  Passivkonto: 'LIABILITY',      // "Liability account"
  Verbindlichkeiten: 'LIABILITY',// Liabilities
  Creditors: 'LIABILITY',
  AccountsPayable: 'LIABILITY',
  // Equity
  Equity: 'EQUITY',
  Eigenkapital: 'EQUITY',
  // Income / Revenue
  Income: 'INCOME',
  Revenue: 'INCOME',
  Ertrag: 'INCOME',
  Erlös: 'INCOME',
  // Expense
  Expense: 'EXPENSE',
  Aufwand: 'EXPENSE',
  Kosten: 'EXPENSE',
  Cost: 'EXPENSE',
}

function mapAccountType(raw: string | undefined): AccountType {
  if (!raw) return 'OTHER'
  return ABACUS_TYPE_MAP[raw] ?? 'OTHER'
}

// ── Main transform ────────────────────────────────────────────────────────────

/** Convert an Abacus GL account OData record to the canonical Account type. */
export function transformAccount(raw: AbacusAccount): Account {
  return {
    id: String(raw.Id),
    customerDefinedCode: raw.AccountNumber || undefined,
    name: raw.Name || undefined,
    description: raw.Description || undefined,
    type: mapAccountType(raw.AccountType),
    status: raw.IsActive === false ? 'ARCHIVED' : 'ACTIVE',
    parentId: raw.ParentId != null ? String(raw.ParentId) : undefined,
    balance: raw.Balance != null ? Math.round(raw.Balance * 100) : undefined,
    currency: raw.CurrencyCode || undefined,
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.ModifiedAt ? new Date(raw.ModifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
