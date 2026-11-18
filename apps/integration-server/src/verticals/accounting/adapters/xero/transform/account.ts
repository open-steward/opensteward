import type { Account, AccountStatus, AccountType } from '../../../schema/account'
import { toUtcDate } from '../../shared/transform'

export interface XeroAccount {
  AccountID: string
  Code: string
  Name: string
  /** Long, open-ended list Xero extends. Sub-classification only — see below. */
  Type: string
  /** Xero's own coarse classification. Closed set; the authority for `type`. */
  Class?: 'ASSET' | 'EQUITY' | 'EXPENSE' | 'LIABILITY' | 'REVENUE'
  Status: 'ACTIVE' | 'ARCHIVED'
  Description: string
  CurrencyCode: string
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  [key: string]: unknown
}

/**
 * `Class` is the authority for `type`, not `Type`.
 *
 * Both arrive on every account. `Class` is Xero's own coarse classification —
 * a closed five-value set that maps 1:1 onto the canonical enum. `Type` is a
 * long list Xero extends, and its published enum is inconsistent between
 * Xero's own documents.
 *
 * Consulting `Type` alone meant one unlisted value discarded a perfectly good
 * `Class`: the demo org's Inventory account is `Class: ASSET, Type: INVENTORY`
 * and came out `OTHER`, which puts an asset in the wrong section of any
 * balance sheet derived from this data. Silent, and plausible-looking.
 *
 * So: `Class` decides, `Type` fills in when `Class` is absent, and `OTHER`
 * requires that NEITHER signal is usable. `Type` is still carried through as
 * `group` — it is real sub-classification, it just is not the classification.
 */
const XERO_CLASS_MAP: Record<string, AccountType> = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'INCOME',
  EXPENSE: 'EXPENSE',
}

const XERO_TYPE_MAP: Record<string, AccountType> = {
  BANK: 'ASSET',
  INVENTORY: 'ASSET',
  CURRENT: 'ASSET',
  FIXED: 'ASSET',
  NONCURRENT: 'ASSET',
  PREPAYMENT: 'ASSET',
  EQUITY: 'EQUITY',
  CURRLIAB: 'LIABILITY',
  LIABILITY: 'LIABILITY',
  TERMLIAB: 'LIABILITY',
  PAYGLIABILITY: 'LIABILITY',
  SUPERANNUATIONLIABILITY: 'LIABILITY',
  WAGESPAYABLELIABILITY: 'LIABILITY',
  REVENUE: 'INCOME',
  SALES: 'INCOME',
  OTHERINCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  OVERHEADS: 'EXPENSE',
  DIRECTCOSTS: 'EXPENSE',
  DEPRECIATN: 'EXPENSE',
  SUPERANNUATIONEXPENSE: 'EXPENSE',
  WAGESEXPENSE: 'EXPENSE',
}

function mapType(raw: XeroAccount): AccountType {
  const cls = typeof raw.Class === 'string' ? raw.Class.toUpperCase() : undefined
  const byClass = cls ? XERO_CLASS_MAP[cls] : undefined
  if (byClass) return byClass
  const type = typeof raw.Type === 'string' ? raw.Type.toUpperCase() : undefined
  return (type ? XERO_TYPE_MAP[type] : undefined) ?? 'OTHER'
}

export function transformAccount(raw: XeroAccount): Account {
  const status: AccountStatus = raw.Status === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.AccountID,
    name: raw.Name || undefined,
    description: raw.Description || undefined,
    customerDefinedCode: raw.Code || undefined,
    type: mapType(raw),
    group: raw.Type || undefined,
    status,
    currency: raw.CurrencyCode || undefined,
    // A genuine instant, so NOT routed through toCalendarDate. This is the
    // value `updated_after` filters on, and truncating it to a date would
    // reopen the incremental-sync gap it exists to close.
    updatedAt: toUtcDate(raw.UpdatedDateUTC),
    metadata: raw as Record<string, unknown>,
  }
}
