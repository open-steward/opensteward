/**
 * Viva.com wallet ledger entry (Account Transactions) → canonical Payout.
 *
 * Source: Payment API spec (https://developer.viva.com/downloads/payment-api.yaml),
 * definition `account_transactions_200`, the row of
 * `POST /dataservices/v2/accounttransactions/Search`. Only the fields this
 * transform reads are typed; everything else stays on `raw`.
 *
 * Payout rows are the two subtypes Viva's SubTypeId table
 * (https://developer.viva.com/webhooks-for-payments/account-transaction-created/#subtype-ids-of-transactions)
 * names as money leaving the wallet for the merchant's own destination:
 *   "30 PayOutIban This is a debit transaction equal to the amount of money a
 *    customer sent from their account to an IBAN account."
 *   "31 PayOutCard This is a debit transaction equal to the amount of money a
 *    customer sent from their account to a card."
 *
 * Not mapped, because the search row documents nothing that supports it:
 *   status   — the row has no status field, so it is `unknown`. A ledger debit
 *              says the money left the wallet, not that the bank or card
 *              received it (Viva also has a "PayOutIbanReversal" tag).
 *   method   — nothing distinguishes a standard from an instant transfer.
 *   arrivalDate — `valueDate` is described only as "valueDate" on the search.
 */

import { majorToMinor } from '@opensteward/shared'
import type { Payout } from '../../../schema/payout'
import { toIsoDatetime } from './shared'
import { currencyByNumeric } from './transaction'

export interface RawVivaComAccountTransaction {
  /** "The ID of the transaction" */
  accountTransactionId: string
  /** "The creation date of the transaction" */
  created?: string | null
  /** "The wallet in which this transaction took place" */
  walletId?: number | null
  /** "The 'subtype' of the transaction" */
  subTypeId?: number | null
  /**
   * "The amount of the transaction" (major units, e.g. 5.20). The webhook
   * (https://developer.viva.com/webhooks-for-payments/account-transaction-created/)
   * says: "The signed amount of the transaction. Represents the total funds
   * paid by the customer and includes TotalFee (when applicable)". Payout fees
   * are their own subtypes there (FeePayOutCard, FeePayOutIban), which this
   * list does not request.
   */
  amount?: number | null
  /** "The currency used for this transaction" (ISO 4217 numeric, e.g. 978). */
  currencyCode?: number | null
  [key: string]: unknown
}

/** SubTypeId → name, for the payout subtypes only (SubTypeId table, see above). */
export const PAYOUT_SUBTYPES: Readonly<Record<number, string>> = {
  30: 'PayOutIban',
  31: 'PayOutCard',
}

export const PAYOUT_SUBTYPE_IDS: readonly number[] = [30, 31]

export function transformPayout(raw: RawVivaComAccountTransaction): Payout {
  const id = raw.accountTransactionId
  const subType = typeof raw.subTypeId === 'number' ? PAYOUT_SUBTYPES[raw.subTypeId] : undefined
  if (!subType) {
    throw new Error(
      `Viva.com account transaction ${id} has subTypeId ${String(raw.subTypeId)}, not a payout subtype (30 PayOutIban, 31 PayOutCard)`,
    )
  }
  const currency = currencyByNumeric(raw.currencyCode)
  if (!currency) {
    throw new Error(
      `Viva.com account transaction ${id} has currencyCode ${String(raw.currencyCode)}, not one of Viva's documented currencies`,
    )
  }
  const signed = majorToMinor(raw.amount, currency)
  if (signed === undefined) {
    throw new Error(`Viva.com account transaction ${id} has no amount`)
  }
  const metadata: Record<string, string> = { subType }
  if (typeof raw.walletId === 'number') metadata.walletId = String(raw.walletId)
  return {
    id,
    externalId: id,
    // A payout subtype is "a debit transaction equal to the amount of money …
    // sent", so its size is the magnitude, whatever sign the ledger gives it.
    amount: Math.abs(signed),
    currency,
    status: 'unknown',
    gateway: 'viva-com',
    metadata,
    createdAt: toIsoDatetime(raw.created),
    raw,
  }
}
