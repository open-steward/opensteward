/**
 * Reckon One v2 account (chart of accounts) transforms.
 *
 * API endpoint: GET /R1/{cashbookId}/accounts[/{accountId}]
 *
 * Key fields: id, name, displayId (code), description, type, classification,
 *             isActive, currentBalance, currency
 */

import type { Account, AccountType } from '../../../schema/account'

export interface ReckonOneAccount {
  id: string
  name?: string
  displayId?: string
  description?: string
  /** e.g. "BANK", "CURRENTASSET", "FIXEDASSET", "CURRENTLIABILITY", "LONGTERMLIABILITY",
   *        "EQUITY", "REVENUE", "EXPENSE", "COSTOFGOODSSOLD", "OTHERCURRENTASSET",
   *        "OTHERASSET", "OTHERWEXPENSE", "OTHERINCOME" */
  type?: string
  classification?: string
  isActive?: boolean
  currentBalance?: number
  currency?: string
  parentId?: string
  taxCode?: { id?: string }
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

const RECKON_TYPE_MAP: Record<string, AccountType> = {
  BANK: 'ASSET',
  CURRENTASSET: 'ASSET',
  FIXEDASSET: 'ASSET',
  OTHERASSET: 'ASSET',
  OTHERCURRENTASSET: 'ASSET',
  ACCOUNTSRECEIVABLE: 'ASSET',
  CURRENTLIABILITY: 'LIABILITY',
  LONGTERMLIABILITY: 'LIABILITY',
  ACCOUNTSPAYABLE: 'LIABILITY',
  CREDITCARD: 'LIABILITY',
  OTHERCURRENTLIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'INCOME',
  OTHERINCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  COSTOFGOODSSOLD: 'EXPENSE',
  OTHERWEXPENSE: 'EXPENSE',
}

function normalizeType(raw: string | undefined): AccountType {
  if (!raw) return 'OTHER'
  return RECKON_TYPE_MAP[raw.toUpperCase().replace(/\s+/g, '')] ?? 'OTHER'
}

export function transformAccount(raw: ReckonOneAccount): Account {
  return {
    id: raw.id,
    name: raw.name || undefined,
    customerDefinedCode: raw.displayId || undefined,
    description: raw.description || undefined,
    type: normalizeType(raw.type ?? raw.classification),
    status: raw.isActive === false ? 'ARCHIVED' : 'ACTIVE',
    balance: raw.currentBalance != null ? Math.round(raw.currentBalance * 100) : undefined,
    currency: raw.currency || undefined,
    parentId: raw.parentId || undefined,
    createdAt: raw.createdDateTime ? new Date(raw.createdDateTime) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
