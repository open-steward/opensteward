import type { Dispute, DisputeStatus } from '../../../schema/dispute'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawIuguChargeback {
  [k: string]: unknown
}

/**
 * Maps iugu chargeback statuses to canonical DisputeStatus values.
 * Iugu status strings (pt-BR): pending, contested, under_review, won, lost, canceled.
 */
function mapDisputeStatus(s: string | undefined | null): DisputeStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'won' || v === 'ganha' || v === 'ganha/pago' || v === 'pago') return 'won'
  if (v === 'lost' || v === 'perdida' || v === 'perdido') return 'lost'
  if (v === 'contested' || v === 'contestada' || v === 'contestado') return 'under_review'
  if (v === 'under_review' || v === 'aguardando_resolucao' || v === 'aguardando resolução') return 'under_review'
  if (v === 'charge_refunded' || v === 'refunded') return 'charge_refunded'
  if (v === 'warning_needs_response' || v === 'warning_under_review' || v === 'warning_closed') return v as DisputeStatus
  return 'needs_response'
}

export function transformDispute(raw: RawIuguChargeback): Dispute {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    chargeId: String(raw['invoice_id'] ?? raw['charge_id'] ?? ''),
    amount: safeInt(raw['amount_cents'] ?? raw['total_cents']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'BRL'),
    status: mapDisputeStatus(raw['status'] as string | undefined),
    reason: undefined,
    evidenceDueBy: raw['deadline_date'] != null ? String(raw['deadline_date']) : undefined,
    network: raw['payment_method'] != null ? String(raw['payment_method']) : undefined,
    gateway: 'iugu',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    updatedAt: raw['updated_at'] != null ? String(raw['updated_at']) : undefined,
    raw,
  }
}
