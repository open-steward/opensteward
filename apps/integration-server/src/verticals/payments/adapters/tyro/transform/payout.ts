/**
 * Tyro Reporting settlement -> canonical Payout.
 *
 * Source: the `settlement` and `settlement-details` schemas of
 * GET /reporting/merchants/{mid}/settlements
 * https://docs.connect.tyro.com/_spec/api-explorer/reporting/1.0/index.yaml
 *
 *   clearingPaymentId: "ID of the clearing payment run used to bundle
 *     transactions for a settlement."
 *   grossAmount: "Signed gross amount settled, in cents."
 *   settlementDetails[].settlementStatus, lastUpdatedAt (RFC 3339)
 *
 * No currency code is returned; it comes from the connection.
 */

import type { Payout } from '../../../schema/payout'
import { requireCents, requireCurrency, compactMap, toIsoDatetime } from './reporting'

export interface RawTyroSettlementDetail {
  type: string
  settlementAmount?: number
  lastUpdatedAt?: string
  settlementStatus?: string
  lodgementReference?: string
  [key: string]: unknown
}

export interface RawTyroSettlement {
  clearingPaymentId?: string
  grossAmount?: number
  settlementDetails: RawTyroSettlementDetail[]
  [key: string]: unknown
}

/**
 * `settlementStatus` enum and its documented meanings:
 *   SENT - "successfully sent from Tyro to the merchant's destination financial institution"
 *   PENDING - "initiated by Tyro, but funds have not yet left Tyro's systems"
 *   ON_HOLD - "currently withheld ... Funds are retained by Tyro until resolution"
 *   RESUBMISSION_INITIATED / RESUBMISSION_SENT / RESUBMISSION_ON_HOLD
 *   WITHHELD_BY_ACQUIRER / WITHHELD_BY_BANK - "The settlement failed ..."
 */
function mapDetailStatus(status: unknown): Payout['status'] {
  switch (status) {
    case 'SENT':
    case 'RESUBMISSION_SENT':
      return 'paid'
    case 'PENDING':
    case 'ON_HOLD':
    case 'RESUBMISSION_INITIATED':
    case 'RESUBMISSION_ON_HOLD':
      return 'pending'
    case 'WITHHELD_BY_ACQUIRER':
    case 'WITHHELD_BY_BANK':
      return 'failed'
    default:
      return 'unknown'
  }
}

/** One status when every detail agrees; `unknown` when they differ or there are none. */
function mapStatus(details: RawTyroSettlementDetail[]): Payout['status'] {
  const statuses = new Set(details.map((d) => mapDetailStatus(d.settlementStatus)))
  return statuses.size === 1 ? [...statuses][0]! : 'unknown'
}

function latest(details: RawTyroSettlementDetail[]): string | undefined {
  let best: string | undefined
  for (const d of details) {
    const iso = toIsoDatetime(d.lastUpdatedAt)
    if (iso && (!best || iso > best)) best = iso
  }
  return best
}

export function transformPayout(
  raw: RawTyroSettlement,
  context: { currency: string; mid: string; settlementDate: string },
): Payout {
  if (typeof raw.clearingPaymentId !== 'string' || raw.clearingPaymentId === '') {
    throw new Error(`Tyro settlement on ${context.settlementDate} has no clearingPaymentId`)
  }
  const details = Array.isArray(raw.settlementDetails) ? raw.settlementDetails : []
  const updatedAt = latest(details)
  return {
    id: raw.clearingPaymentId,
    externalId: raw.clearingPaymentId,
    amount: requireCents(raw.grossAmount, `settlement ${raw.clearingPaymentId} grossAmount`),
    currency: requireCurrency(context.currency),
    status: mapStatus(details),
    gateway: 'tyro',
    metadata: compactMap({ mid: context.mid, settlementDate: context.settlementDate }),
    ...(updatedAt ? { updatedAt } : {}),
    raw,
  }
}
