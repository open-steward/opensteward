import { requireAmount } from '@opensteward/shared'

import type { Dispute, DisputeReason, DisputeStatus } from '../../../schema/dispute'
import { pickCurrency, strMap } from './shared'

export interface RawAdyenDispute {
  disputePspReference?: string
  paymentPspReference?: string
  amount?: { value?: number; currency?: string }
  disputeStatus?: string
  disputeReason?: string
  defenseDeadline?: string
  [k: string]: unknown
}

function mapStatus(raw: RawAdyenDispute): DisputeStatus {
  switch ((raw.disputeStatus ?? '').toLowerCase()) {
    case 'won':
      return 'won'
    case 'lost':
      return 'lost'
    case 'pending':
    case 'open':
      return 'needs_response'
    case 'under_review':
      return 'under_review'
    default:
      return 'needs_response'
  }
}

function mapReason(raw: RawAdyenDispute): DisputeReason | undefined {
  switch ((raw.disputeReason ?? '').toLowerCase()) {
    case 'fraud':
    case 'fraudulent':
      return 'fraudulent'
    case 'duplicate':
      return 'duplicate'
    case 'product_not_received':
      return 'product_not_received'
    case 'product_unacceptable':
      return 'product_unacceptable'
    default:
      return raw.disputeReason ? 'other' : undefined
  }
}

export function transformDispute(raw: RawAdyenDispute): Dispute {
  return {
    id: String(raw.disputePspReference ?? ''),
    externalId: String(raw.disputePspReference ?? ''),
    chargeId: raw.paymentPspReference ?? '',
    amount: requireAmount(raw.amount?.value, 'adyen dispute'),
    currency: pickCurrency(raw.amount?.currency),
    status: mapStatus(raw),
    reason: mapReason(raw),
    evidenceDueBy: raw.defenseDeadline,
    gateway: 'adyen',
    metadata: strMap({}),
    raw,
  }
}
