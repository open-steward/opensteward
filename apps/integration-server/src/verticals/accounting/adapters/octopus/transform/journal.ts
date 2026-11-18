/**
 * Octopus → canonical Journal transform.
 *
 * Octopus REST API endpoint: GET /bookings, GET /bookings/{id}
 *
 * Bookings (boekingen) are the journal-entry level records in Octopus.  Each
 * booking consists of a header plus debit/credit lines against general-ledger
 * accounts.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'

export interface OctopusBookingLine {
  lineId?: number
  accountNumber?: string
  accountId?: number
  description?: string
  debitAmount?: number
  creditAmount?: number
  vatAmount?: number
  contactId?: number
  [key: string]: unknown
}

export interface OctopusBooking {
  bookingId?: number
  journalNumber?: string
  description?: string
  reference?: string
  bookingDate?: string
  currency?: string
  vatAmount?: number
  source?: string
  lines?: OctopusBookingLine[]
  [key: string]: unknown
}

function mapBookingLine(line: OctopusBookingLine): JournalLineitem {
  const accountId =
    line.accountNumber || (line.accountId !== undefined ? String(line.accountId) : undefined)
  return {
    id: line.lineId !== undefined ? String(line.lineId) : undefined,
    accountId: accountId || undefined,
    contactId: line.contactId !== undefined ? String(line.contactId) : undefined,
    description: line.description || undefined,
    debitAmount: line.debitAmount,
    creditAmount: line.creditAmount,
    taxAmount: line.vatAmount,
  }
}

export function transformJournal(raw: OctopusBooking): Journal {
  return {
    id: raw.bookingId !== undefined ? String(raw.bookingId) : raw.journalNumber || undefined,
    description: raw.description || undefined,
    reference: raw.reference || raw.journalNumber || undefined,
    source: raw.source || undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.vatAmount,
    lineItems: (raw.lines ?? []).map(mapBookingLine),
    postedAt: raw.bookingDate ? new Date(raw.bookingDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
