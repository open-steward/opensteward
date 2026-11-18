/**
 * KashFlow bank transaction → canonical Transaction transform.
 *
 * KashFlow REST API v2 — Bank Transactions (scoped to a bank account).
 * Endpoint: GET /api/v2/bankaccounts/{id}/transactions,
 *           GET /api/v2/bankaccounts/{id}/transactions/{txnId}
 *
 * Money is split across two positive fields — `PaidIn` (money received) and
 * `PaidOut` (money paid) — there is NO single signed `Amount` field. There is
 * no `Description`/`Reference`/`Currency` on the object: the human label is
 * `Comment` (and/or `Payee`), and dates are `Date`/`TransactionDate`.
 *
 * Docs: https://www.kashflow.com/developers/rest-api/bank-transactions/
 */
import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { toMinorUnits } from '../../shared/transform'

function toDate(val: unknown): Date | undefined {
  const iso = toIsoDatetime(val)
  return iso ? new Date(iso) : undefined
}

export interface KashflowBankTransaction {
  Id?: number | string
  /** Money received (positive). */
  PaidIn?: number
  /** Money paid out (positive). */
  PaidOut?: number
  /** Human label for the transaction. No `Description` field exists. */
  Comment?: string
  /** Counterparty name. */
  Payee?: string
  /** Free-text classifier, e.g. "Sale - 000001" / "Purchase - ASDA0". */
  Type?: string
  /** Numeric classifiers. */
  TransactionType?: number
  MoneyType?: number
  TransactionNumber?: number | string
  ResourceNumber?: number | string
  Date?: string
  TransactionDate?: string
  AccountId?: number | string
  [key: string]: unknown
}

/** Net signed amount in minor units: positive for money in, negative for money out. */
function netMinorUnits(raw: KashflowBankTransaction): number | undefined {
  const paidIn = toMinorUnits(raw.PaidIn)
  const paidOut = toMinorUnits(raw.PaidOut)
  if (paidIn === undefined && paidOut === undefined) return undefined
  return (paidIn ?? 0) - (paidOut ?? 0)
}

function mapLineitems(raw: KashflowBankTransaction): TransactionLineitem[] {
  return [
    {
      accountId: raw.AccountId !== undefined ? String(raw.AccountId) : undefined,
      description: raw.Comment || raw.Payee || undefined,
      totalAmount: netMinorUnits(raw),
    },
  ]
}

export function transformTransaction(raw: KashflowBankTransaction): Transaction {
  const reference =
    raw.TransactionNumber !== undefined
      ? String(raw.TransactionNumber)
      : raw.ResourceNumber !== undefined
        ? String(raw.ResourceNumber)
        : undefined

  return {
    id: raw.Id !== undefined ? String(raw.Id) : undefined,
    accountId: raw.AccountId !== undefined ? String(raw.AccountId) : undefined,
    type: raw.Type || undefined,
    reference,
    memo: raw.Comment || raw.Payee || undefined,
    totalAmount: netMinorUnits(raw),
    lineItems: mapLineitems(raw),
    createdAt: toDate(raw.Date ?? raw.TransactionDate),
    metadata: raw as Record<string, unknown>,
  }
}
