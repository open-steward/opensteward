import type { Dispute, DisputeStatus } from '../../../schema/dispute'
import { sgDatetime } from './shared'

/**
 * One entry of an order's `chargebacks[]` in the chargebacks report
 * (POST https://reports.solidgate.com/api/v1/card-orders/chargebacks).
 * Required there: id, created_at, updated_at, dispute_date, amount, currency.
 */
export interface RawSolidgateChargeback {
  id: string
  created_at: string
  updated_at: string
  dispute_date: string
  settlement_date?: string
  amount: number
  currency: string
  type?: string
  status?: string
  reason_group?: string
  reason_code?: string
  reason_description?: string
  flows?: Array<{ deadline_date?: string; created_at: string }>
}

/**
 * Chargeback statuses, from https://docs.solidgate.com/risks/chargebacks/#statuses:
 * in_progress "Solidgate has received the chargeback. The merchant can provide
 * compelling evidence or accept the dispute before the specified deadline.";
 * document_sent "Solidgate has forwarded all supporting documents to the card
 * scheme."; reversed "the merchant has successfully challenged the chargeback
 * and had the disputed amount credited back."; accepted "the merchant agreed to
 * the dispute or did not submit defense documents."; resolved "the dispute is
 * concluded through Rapid Dispute Resolution" (a refund); resolved_reversal
 * "the chargeback is cancelled because a refund and RDR occurred simultaneously".
 */
const STATUS: Record<string, DisputeStatus> = {
  in_progress: 'needs_response',
  document_sent: 'under_review',
  reversed: 'won',
  accepted: 'lost',
  resolved: 'charge_refunded',
  resolved_reversal: 'charge_refunded',
}

export function transformDispute(cb: RawSolidgateChargeback, orderId: string): Dispute {
  // The response deadline is on the chargeback's flows: "Deadline for
  // submitting a response to contest the dispute." Use the newest flow's.
  const flows = [...(cb.flows ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const deadline = sgDatetime(flows[0]?.deadline_date)
  const metadata: Record<string, string> = {}
  if (cb.type) metadata.type = cb.type
  if (cb.reason_group) metadata.reason_group = cb.reason_group
  if (cb.reason_code) metadata.reason_code = cb.reason_code
  if (cb.reason_description) metadata.reason_description = cb.reason_description
  return {
    id: cb.id,
    externalId: cb.id,
    chargeId: orderId,
    amount: cb.amount,
    currency: cb.currency.toUpperCase(),
    status: (cb.status && STATUS[cb.status]) || 'unknown',
    ...(deadline ? { evidenceDueBy: deadline } : {}),
    gateway: 'solidgate',
    metadata,
    createdAt: sgDatetime(cb.created_at),
    updatedAt: sgDatetime(cb.updated_at),
    raw: cb,
  }
}
