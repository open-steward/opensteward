/**
 * Asaas Chargeback ↔ canonical Dispute.
 *
 * Asaas models chargebacks as a first-class resource under `GET /chargebacks`.
 * Each chargeback entry references the originating payment and carries a status
 * (REQUESTED → IN_DISPUTE → DISPUTE_LOST | REVERSED | DONE) and a reason code.
 *
 * The endpoint also supports `POST /chargebacks/{id}/dispute` to submit
 * evidence, which maps to `submitDisputeEvidence`.
 *
 * Money: chargebacks reference payment amounts in reais; we set the dispute
 * amount from the `value` field. Currency is always BRL.
 *
 * Refs:
 *   https://docs.asaas.com/reference/list-chargebacks
 *   https://docs.asaas.com/reference/retrieve-a-single-chargeback
 *   https://docs.asaas.com/reference/create-a-chargeback-dispute
 */
import type { Dispute, DisputeStatus, DisputeReason } from '../../../schema/dispute'
import { ASAAS_CURRENCY, strMap, toIsoDatetime, toMinorUnits } from './shared'

export interface RawAsaasChargeback {
  object?: string
  id?: string
  dateCreated?: string
  /** Originating payment id. */
  payment?: string
  /** Chargeback value in reais. */
  value?: number
  /** REQUESTED | IN_DISPUTE | DISPUTE_LOST | REVERSED | DONE */
  status?: string
  /**
   * Reason code. Asaas defines 30+ codes; examples: FRAUD,
   * SERVICE_NOT_RECEIVED, COMMERCIAL_DISAGREEMENT, ABSENCE_OF_PRINT.
   */
  reason?: string
  /** ISO date of when the chargeback was first received by the gateway. */
  originDisputeDate?: string
  /** ISO date of the original transaction. */
  originTransactionDate?: string
  /** Card network brand (e.g. VISA, MASTERCARD). */
  creditCardBrand?: string
  [k: string]: unknown
}

function mapStatus(raw: RawAsaasChargeback): DisputeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'REQUESTED':
      return 'needs_response'
    case 'IN_DISPUTE':
      return 'under_review'
    case 'DISPUTE_LOST':
      return 'lost'
    case 'REVERSED':
    case 'DONE':
      return 'won'
    default:
      return 'needs_response'
  }
}

function mapReason(raw: RawAsaasChargeback): DisputeReason | undefined {
  switch ((raw.reason ?? '').toUpperCase()) {
    case 'FRAUD':
    case 'ABSENT_CARD_FRAUD':
    case 'CARD_FRAUD':
    case 'CARD_ACTIVATED_PHONE_TRANSACTION':
      return 'fraudulent'
    case 'ABSENCE_OF_PRINT':
    case 'SERVICE_NOT_RECEIVED':
      return 'product_not_received'
    case 'COMMERCIAL_DISAGREEMENT':
      return 'product_unacceptable'
    case 'CREDIT_NOT_PROCESSED':
      return 'credit_not_processed'
    default:
      return raw.reason ? 'other' : undefined
  }
}

export function transformDispute(raw: RawAsaasChargeback): Dispute {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: String(raw.payment ?? ''),
    amount: toMinorUnits(raw.value) ?? 0,
    currency: ASAAS_CURRENCY,
    status: mapStatus(raw),
    reason: mapReason(raw),
    evidenceDueBy: undefined,
    network: raw.creditCardBrand ? raw.creditCardBrand.toLowerCase() : undefined,
    gateway: 'asaas',
    metadata: strMap({
      reason: raw.reason,
      originDisputeDate: raw.originDisputeDate,
      originTransactionDate: raw.originTransactionDate,
      creditCardBrand: raw.creditCardBrand,
    }),
    createdAt: toIsoDatetime(raw.dateCreated ?? raw.originDisputeDate),
    updatedAt: toIsoDatetime(raw.dateCreated ?? raw.originDisputeDate),
    raw,
  }
}
