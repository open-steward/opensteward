/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { CreditMemo } from '../../../schema/creditmemo'
import { parseTallyDate } from './shared'

export interface TallyCreditMemo {
  VOUCHERNUMBER: string
  PARTYLEDGERNAME: string
  DATE: string
  AMOUNT: string
  NARRATION: string
  [key: string]: unknown
}

export function transformCreditMemo(raw: TallyCreditMemo): CreditMemo {
  const totalAmount = parseFloat(raw.AMOUNT)
  const postedAt = parseTallyDate(raw.DATE)

  return {
    id: raw.VOUCHERNUMBER,
    status: 'AUTHORIZED',
    contactId: raw.PARTYLEDGERNAME || undefined,
    totalAmount: isNaN(totalAmount) ? undefined : totalAmount,
    notes: raw.NARRATION || undefined,
    postedAt,
    metadata: raw as Record<string, unknown>,
  }
}
