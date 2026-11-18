/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Expense } from '../../../schema/expense'
import type { TallyAllLedgerEntry } from './invoice'
import { parseTallyDate } from './shared'

export interface TallyExpense {
  VOUCHERNUMBER: string
  PARTYLEDGERNAME: string
  DATE: string
  AMOUNT: string
  NARRATION: string
  ALLLEDGERENTRIES?: TallyAllLedgerEntry[]
  [key: string]: unknown
}

export function transformExpense(raw: TallyExpense): Expense {
  const totalAmount = parseFloat(raw.AMOUNT)
  const postedAt = parseTallyDate(raw.DATE)

  return {
    id: raw.VOUCHERNUMBER,
    contactId: raw.PARTYLEDGERNAME || undefined,
    totalAmount: isNaN(totalAmount) ? undefined : totalAmount,
    postedAt,
    metadata: raw as Record<string, unknown>,
  }
}
