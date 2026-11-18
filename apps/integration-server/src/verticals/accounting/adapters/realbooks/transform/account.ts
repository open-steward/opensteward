/**
 * RealBooks → canonical Account transform.
 *
 * In RealBooks every account is a "Ledger Group" (chart-of-accounts node)
 * or a "Ledger" that belongs to a group.  The segment master
 * (POST /AMSSERVICE/api/segment/update/{cid}) holds branch-level ledgers.
 *
 * We treat the ledger master records (same wire type as contacts but without
 * party details) as chart-of-account entries when ledgerCategory ≠ "party".
 */

import type { Account, AccountStatus, AccountType } from '../../../schema/account'
import type { RealBooksLedger } from './contact'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(_raw: RealBooksLedger): AccountStatus {
  // RealBooks does not expose an explicit active/inactive flag in the API
  return 'ACTIVE'
}

function mapType(raw: RealBooksLedger): AccountType {
  const nature = (raw.groupNature ?? '').toLowerCase()
  const grp = (raw.ledgerGroupName ?? '').toLowerCase()

  if (nature === 'asset' || grp.includes('asset') || grp.includes('debtor') || grp.includes('bank') || grp.includes('cash'))
    return 'ASSET'
  if (nature === 'liability' || grp.includes('liabilit') || grp.includes('creditor') || grp.includes('loan'))
    return 'LIABILITY'
  if (nature === 'income' || grp.includes('income') || grp.includes('revenue') || grp.includes('sales'))
    return 'INCOME'
  if (nature === 'expense' || grp.includes('expense') || grp.includes('purchase'))
    return 'EXPENSE'
  if (nature === 'equity' || grp.includes('capital') || grp.includes('equity'))
    return 'EQUITY'
  return 'OTHER'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformAccount(raw: RealBooksLedger): Account {
  return {
    id: raw.id !== undefined ? String(raw.id) : raw.ledgerCode || raw.ledgerName,
    name: raw.printName || raw.ledgerName || undefined,
    customerDefinedCode: raw.ledgerCode || undefined,
    type: mapType(raw),
    status: mapStatus(raw),
    group: raw.ledgerGroupName || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
