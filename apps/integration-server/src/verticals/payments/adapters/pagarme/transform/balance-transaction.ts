/**
 * Pagar.me v5 balance-transaction transform.
 *
 * Endpoint: GET /balance/operations (global) or
 *           GET /recipients/{recipientId}/balance/operations (per-recipient)
 *
 * Each "balance operation" records a gross movement in the merchant's
 * settlement balance — charges, refunds, transfers, anticipations, fees, etc.
 * The `type` field carries the operation category; `amount` is the gross
 * delta; `fee` is the gateway fee deducted.
 *
 * Money is in centavos (minor units). Timestamps are ISO-8601 strings.
 *
 * Refs:
 *   https://docs.pagar.me/reference/obter-histórico-das-operações
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-balance-operation-response.md
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-movement-object-base-response.md
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { strMap } from './shared'

export interface RawPagarmeMovementObject {
  object?: string
  id?: string
  status?: string
  amount?: string | number
  type?: string
  charge_id?: string
  gateway_id?: string
  created_at?: string
  [k: string]: unknown
}

export interface RawPagarmeBalanceOperation {
  id?: string
  status?: string
  balance_amount?: string | number
  balance_old_amount?: string | number
  type?: string
  amount?: number
  fee?: string | number
  created_at?: string
  movement_object?: RawPagarmeMovementObject
  [k: string]: unknown
}

/**
 * Map Pagar.me balance operation type to canonical BalanceTransactionType.
 * Known values: payable, refund, transfer, anticipation, fee_collection,
 * settlement, chargeback, chargeback_refund
 */
function mapType(raw: string | undefined): BalanceTransactionType {
  switch ((raw ?? '').toLowerCase()) {
    case 'payable':
    case 'charge':
      return 'charge'
    case 'refund':
    case 'chargeback_refund':
      return 'refund'
    case 'transfer':
      return 'transfer'
    case 'anticipation':
    case 'fee_collection':
      return 'fee'
    case 'chargeback':
      return 'dispute'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(
  raw: RawPagarmeBalanceOperation,
): BalanceTransaction {
  const fee = raw.fee != null ? Number(raw.fee) : undefined
  const amount = raw.amount ?? 0
  const net = fee != null ? amount - fee : undefined
  const mv = raw.movement_object

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapType(raw.type ?? mv?.type),
    amount,
    currency: 'BRL', // Pagar.me balance operations are always in BRL
    fee,
    net,
    sourceId: mv?.id ? String(mv.id) : (mv?.charge_id ? String(mv.charge_id) : undefined),
    sourceType: mv?.object ?? raw.type ?? undefined,
    description: undefined,
    gateway: 'pagarme',
    metadata: strMap({
      status: raw.status,
      balance_amount: raw.balance_amount,
      balance_old_amount: raw.balance_old_amount,
      movement_object_type: mv?.object,
      movement_gateway_id: mv?.gateway_id,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
