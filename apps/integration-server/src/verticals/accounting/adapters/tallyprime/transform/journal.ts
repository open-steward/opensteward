/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 *
 * A journal is a Journal voucher, exported through the documented Export
 * Collection Type=Voucher request (see ../index.ts) filtered to
 * VoucherTypeName="Journal". GUID (falling back to MASTERID) is the id:
 * VOUCHERNUMBER resets per book/voucher-type and is not unique, and it would
 * also not match what getJournal's GUID/MASTERID lookup expects back.
 */

import type { Journal } from '../../../schema/journal'
import type { JournalLineitem } from '../../../schema/shared'
import { parseTallyDate } from './shared'

export interface TallyJournalEntry {
  LEDGERNAME: string
  AMOUNT: string
  ISDEEMEDPOSITIVE: string
}

export interface TallyJournal {
  GUID: string
  MASTERID: string
  VOUCHERNUMBER: string
  DATE: string
  NARRATION: string
  ALLLEDGERENTRIES?: TallyJournalEntry[]
  [key: string]: unknown
}

function mapLineitem(entry: TallyJournalEntry): JournalLineitem {
  const amount = Math.abs(parseFloat(entry.AMOUNT))
  const isDebit = entry.ISDEEMEDPOSITIVE === 'Yes'

  return {
    accountId: entry.LEDGERNAME || undefined,
    debitAmount: isDebit ? amount : undefined,
    creditAmount: !isDebit ? amount : undefined,
  }
}

export function transformJournal(raw: TallyJournal): Journal {
  const postedAt = parseTallyDate(raw.DATE)
  const entries = raw.ALLLEDGERENTRIES ?? []

  return {
    id: raw.GUID || raw.MASTERID,
    description: raw.NARRATION || undefined,
    reference: raw.VOUCHERNUMBER || undefined,
    lineItems: entries.map(mapLineitem),
    postedAt,
    metadata: raw as Record<string, unknown>,
  }
}
