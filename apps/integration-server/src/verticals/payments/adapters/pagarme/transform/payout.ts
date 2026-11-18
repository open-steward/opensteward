/**
 * Pagar.me v5 payout transform.
 *
 * Endpoint: GET /payables, GET /payables/{id}
 * A "payable" (recebível) is Pagar.me's settlement unit — the funds
 * scheduled to be transferred to the merchant's bank account on a future
 * `payment_date`. This maps cleanly to the canonical **Payout**.
 *
 * Money is in centavos (minor units). Dates are ISO-8601 strings.
 *
 * Refs:
 *   https://docs.pagar.me/reference/retornando-recebíveis
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-payable-response.md
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { strMap } from './shared'

export interface RawPagarmePayable {
  id?: number | string
  status?: string
  amount?: number
  fee?: number
  anticipation_fee?: number
  fraud_coverage_fee?: number
  installment?: number
  gateway_id?: number | string
  charge_id?: string
  split_id?: string
  bulk_anticipation_id?: string
  anticipation_id?: string
  recipient_id?: string
  originator_model?: string
  originator_model_id?: string
  payment_date?: string
  original_payment_date?: string
  type?: string
  payment_method?: string
  accrual_at?: string
  created_at?: string
  liquidation_arrangement_id?: string
  [k: string]: unknown
}

/**
 * Map Pagar.me payable status to canonical PayoutStatus.
 * Known statuses: waiting_funds, prepaid, transferred, suspended, canceled
 */
function mapStatus(raw: string | undefined): PayoutStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'transferred':
      return 'paid'
    case 'waiting_funds':
      return 'pending'
    case 'prepaid':
      return 'in_transit'
    case 'suspended':
    case 'canceled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawPagarmePayable): Payout {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: 'BRL', // Pagar.me payables are always in BRL
    status: mapStatus(raw.status),
    method: 'standard',
    arrivalDate: toIsoDatetime(raw.payment_date),
    statementDescriptor: undefined,
    failureCode: undefined,
    failureMessage: undefined,
    gateway: 'pagarme',
    metadata: strMap({
      charge_id: raw.charge_id,
      recipient_id: raw.recipient_id,
      type: raw.type,
      payment_method: raw.payment_method,
      originator_model: raw.originator_model,
      originator_model_id: raw.originator_model_id,
      installment: raw.installment,
      fee: raw.fee,
      anticipation_fee: raw.anticipation_fee,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.payment_date),
    raw,
  }
}
