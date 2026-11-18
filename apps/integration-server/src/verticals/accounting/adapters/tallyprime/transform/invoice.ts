/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Invoice } from '../../../schema/invoice'
import { parseTallyDate } from './shared'

export interface TallyAllLedgerEntry {
  LEDGERNAME: string
  AMOUNT: string
  ISDEEMEDPOSITIVE: string
}

export interface TallyInvoice {
  VOUCHERNUMBER: string
  PARTYLEDGERNAME: string
  DATE: string
  AMOUNT: string
  NARRATION: string
  ALLLEDGERENTRIES?: TallyAllLedgerEntry[]
  [key: string]: unknown
}

export function transformInvoice(raw: TallyInvoice): Invoice {
  return {
    id: raw.VOUCHERNUMBER,
    type: 'INVOICE',
    status: 'AUTHORIZED',
    invoiceNumber: raw.VOUCHERNUMBER || undefined,
    contactId: raw.PARTYLEDGERNAME || undefined,
    totalAmount: parseFloat(raw.AMOUNT),
    notes: raw.NARRATION || undefined,
    postedAt: parseTallyDate(raw.DATE),
    metadata: raw as Record<string, unknown>,
  }
}
