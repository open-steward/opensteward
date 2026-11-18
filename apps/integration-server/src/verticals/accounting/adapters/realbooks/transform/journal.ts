import { toDate } from '../../shared/transform'
/**
 * RealBooks → canonical Journal transform.
 *
 * Journal entries in RealBooks are "Account Vouchers"
 * (transactionType = "Journal" or "Payment" / "Receipt" etc.).
 *
 * Write endpoints:
 *   POST /AMSSERVICE/api/accv/v2/vcreate/{cid}/{segid}
 *   POST /AMSSERVICE/api/accv/v2/vupdate/{cid}/{segid}
 *
 * Note: The RealBooks public API does NOT expose a dedicated read endpoint for
 * account voucher transactions. `listJournals` and `getJournal` are therefore
 * not implemented (the adapter falls back to 501 for those operations).
 *
 * Date format: RealBooks returns and expects dates in DD-MM-YYYY format.
 * Amounts: RealBooks uses decimal major units; canonical amounts are INTEGER
 * MINOR UNITS (multiply by 100 + Math.round).
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import type { RealBooksLedgerDetail } from './invoice'
import { parseDDMMYYYY, toDDMMYYYY, toMinorUnits } from './invoice'

// ── RealBooks wire types ──────────────────────────────────────────────────────

export interface RealBooksAccountVoucher {
  id?: number
  transactionDate?: string
  transactionNumber?: string
  transactionType?: string
  transactionDescription?: string
  txnCode?: string
  apiRef?: string
  currencySymbol?: string
  ledgerDetails?: RealBooksLedgerDetail[]
  accountsTransaction?: {
    id?: number
    transactionDate?: string
    transactionNumber?: string
    transactionType?: string
    transactionDescription?: string
    ledgerDetails?: RealBooksLedgerDetail[]
  }
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ledgerName(ld: RealBooksLedgerDetail): string | undefined {
  if (typeof ld.ledger === 'string') return ld.ledger || undefined
  if (ld.ledger && typeof ld.ledger === 'object') {
    return (ld.ledger as { ledgerName?: string }).ledgerName || undefined
  }
  return undefined
}

function mapLedgerRow(ld: RealBooksLedgerDetail): JournalLineitem {
  const name = ledgerName(ld)
  const amountType = (ld.amountType ?? '').toLowerCase()
  const amountMinor = toMinorUnits(ld.amount)
  return {
    accountId: name,
    debitAmount: amountType === 'dr' ? amountMinor : undefined,
    creditAmount: amountType === 'cr' ? amountMinor : undefined,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformJournal(raw: RealBooksAccountVoucher): Journal {
  const txn = raw.accountsTransaction ?? raw
  const id = raw.id ?? (txn as RealBooksAccountVoucher).id
  const txnNumber = raw.transactionNumber ?? (txn as RealBooksAccountVoucher).transactionNumber
  const txnDate = raw.transactionDate ?? (txn as RealBooksAccountVoucher).transactionDate
  const ledgerDetails =
    (txn as RealBooksAccountVoucher).ledgerDetails ??
    raw.ledgerDetails ??
    []

  return {
    id: id !== undefined ? String(id) : txnNumber,
    description: raw.transactionDescription || undefined,
    reference: txnNumber || undefined,
    source: raw.transactionType || undefined,
    lineItems: ledgerDetails.map(mapLedgerRow),
    postedAt: parseDDMMYYYY(txnDate),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → RealBooks Account Voucher json_obj) ──────────────

export function untransformJournal(journal: Partial<Journal>): Record<string, unknown> {
  return {
    id: 0,
    transactionDate: toDDMMYYYY(toDate(journal.postedAt)),
    transactionNumber: journal.reference ?? '',
    transactionDescription: journal.description ?? '',
    transactionType: journal.source ?? 'Journal',
    ledgerDetails: (journal.lineItems ?? []).map((li) => {
      const isDebit = li.debitAmount !== undefined && li.debitAmount !== null
      // Canonical amounts are integer minor units; RealBooks expects decimal major units
      const minorAmount = isDebit ? li.debitAmount : li.creditAmount
      const majorAmount = minorAmount != null ? minorAmount / 100 : 0
      return {
        ledger: {
          id: 0,
          ledgerName: li.accountId ?? '',
        },
        amountType: isDebit ? 'dr' : 'cr',
        amount: majorAmount,
      }
    }),
  }
}
