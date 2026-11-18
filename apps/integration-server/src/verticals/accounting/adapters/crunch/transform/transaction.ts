import type { Transaction } from '../../../schema/transaction'

// ── Crunch wire types ─────────────────────────────────────────────────────────

/**
 * PaymentDto as returned by GET /banking/bank-accounts/{id}/payments
 * (paged via `PagePaymentDto.content[]`).
 */
export interface CrunchPaymentDto {
  id?: number
  amount?: number
  date?: string
  description?: string
  statementEntryId?: number
  paymentType?: string
  paymentName?: string
  /** DEBIT or CREDIT */
  amountType?: string
  unmatchable?: boolean
  deletable?: boolean
  reference?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

/**
 * Transform a Crunch PaymentDto into the canonical Transaction shape.
 *
 * Payments are fetched per bank account via
 * GET /banking/bank-accounts/{id}/payments.
 *
 * @param raw       The PaymentDto object.
 * @param accountId The bank account ID this payment belongs to.
 */
export function transformPayment(raw: CrunchPaymentDto, accountId?: string): Transaction {
  const amountMinor =
    raw.amount !== undefined ? Math.round(Math.abs(raw.amount) * 100) : undefined

  // Crunch returns a signed amount with amountType DEBIT/CREDIT.
  // Use amountType to determine the canonical transaction type direction.
  const type = raw.amountType?.toUpperCase() === 'DEBIT' ? 'DEBIT' : 'CREDIT'

  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    accountId,
    type,
    reference: raw.reference ?? undefined,
    memo: raw.description ?? raw.paymentName ?? undefined,
    totalAmount: amountMinor,
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: { ...raw, _accountId: accountId } as Record<string, unknown>,
  }
}
