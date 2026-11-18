/**
 * AFAS Profit_CreditNotes GetConnector → canonical CreditMemo transform.
 *
 * Fields returned by Profit_CreditNotes:
 *   CrNoteNr      — credit note number / id
 *   DebtorId      — debtor/customer code
 *   Description   — credit note description
 *   AmtNote       — total credit note amount
 *   Balance       — remaining balance
 *   CurrencyId    — currency code
 *   ExpDate       — expiry / due date
 *   NookPieceDate — posting / booking date
 */
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import { toMinorUnits } from '../../shared/transform'

export interface AfasCreditNote {
  CrNoteNr: string
  DebtorId: string
  Description: string
  AmtNote: number
  Balance: number
  CurrencyId: string
  ExpDate: string
  NookPieceDate: string
  [key: string]: unknown
}

function mapStatus(cm: AfasCreditNote): CreditMemoStatus {
  const total = cm.AmtNote ?? 0
  const balance = cm.Balance ?? 0
  if (total !== 0 && balance === 0) return 'PAID'
  if (balance > 0 && balance < Math.abs(total)) return 'PARTIALLY_PAID'
  if (balance > 0) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformCreditMemo(raw: AfasCreditNote): CreditMemo {
  return {
    id: raw.CrNoteNr,
    status: mapStatus(raw),
    creditmemoNumber: raw.CrNoteNr || undefined,
    contactId: raw.DebtorId || undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: toMinorUnits(raw.AmtNote),
    balanceAmount: toMinorUnits(raw.Balance),
    notes: raw.Description || undefined,
    postedAt: typeof raw.NookPieceDate === 'string' && raw.NookPieceDate ? new Date(raw.NookPieceDate) : undefined,
    dueAt: typeof raw.ExpDate === 'string' && raw.ExpDate ? new Date(raw.ExpDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
