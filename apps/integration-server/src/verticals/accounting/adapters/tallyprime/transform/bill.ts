/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 *
 * A bill is a Purchase voucher, exported through the documented Export
 * Collection Type=Voucher request (see ../index.ts) filtered to
 * VoucherTypeName="Purchase" — not the bill-wise BILLNAME/PARTYNAME shape
 * this file used before. GUID (falling back to MASTERID) is the id:
 * VOUCHERNUMBER resets per book/voucher-type and is not unique.
 */

import type { Bill } from '../../../schema/bill'
import { parseTallyDate } from './shared'

export interface TallyBill {
  GUID: string
  MASTERID: string
  VOUCHERNUMBER: string
  PARTYLEDGERNAME: string
  DATE: string
  AMOUNT: string
  NARRATION: string
  [key: string]: unknown
}

export function transformBill(raw: TallyBill): Bill {
  const totalAmount = parseFloat(raw.AMOUNT)
  const postedAt = parseTallyDate(raw.DATE)

  return {
    id: raw.GUID || raw.MASTERID,
    status: 'AUTHORIZED',
    billNumber: raw.VOUCHERNUMBER || undefined,
    contactId: raw.PARTYLEDGERNAME || undefined,
    totalAmount: isNaN(totalAmount) ? undefined : totalAmount,
    notes: raw.NARRATION || undefined,
    postedAt,
    metadata: raw as Record<string, unknown>,
  }
}
