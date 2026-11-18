/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 *
 * A transaction is a Receipt, Payment or Contra voucher, exported through the
 * documented Export Collection Type=Voucher request (see ../index.ts).
 * Payment could in principle also fit `expense`, but this adapter does not
 * implement listExpenses/getExpense at all, so there is no split to
 * reconcile — Payment vouchers surface only here. GUID (falling back to
 * MASTERID) is the id: VOUCHERNUMBER resets per book/voucher-type and is not
 * unique, and it would also not match what getTransaction's GUID/MASTERID
 * lookup expects back.
 */

import type { Transaction, TransactionContact } from '../../../schema/transaction'
import { parseTallyDate } from './shared'

export interface TallyTransaction {
  GUID: string
  MASTERID: string
  VOUCHERNUMBER: string
  VOUCHERTYPENAME: string
  PARTYLEDGERNAME: string
  DATE: string
  AMOUNT: string
  NARRATION: string
  [key: string]: unknown
}

export function transformTransaction(raw: TallyTransaction): Transaction {
  const totalAmount = parseFloat(raw.AMOUNT)
  const postedAt = parseTallyDate(raw.DATE)

  const contacts: TransactionContact[] = raw.PARTYLEDGERNAME
    ? [{ id: raw.PARTYLEDGERNAME, name: raw.PARTYLEDGERNAME }]
    : []

  return {
    id: raw.GUID || raw.MASTERID,
    type: raw.VOUCHERTYPENAME || undefined,
    reference: raw.VOUCHERNUMBER || undefined,
    memo: raw.NARRATION || undefined,
    totalAmount: isNaN(totalAmount) ? undefined : totalAmount,
    contacts: contacts.length > 0 ? contacts : undefined,
    postedAt,
    metadata: raw as Record<string, unknown>,
  }
}
