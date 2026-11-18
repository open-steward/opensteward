/**
 * Commerce Layer Transaction → canonical Transaction.
 *
 * Commerce Layer has separate resources for Authorizations, Captures,
 * Refunds (payment), and Voids. For the canonical model we unify them
 * under Transaction with `kind` set accordingly.
 *
 * Money fields use `_cents` suffix (integer) and `_float` suffix (string).
 */

import type {
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '../../../schema/transaction'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCLTransaction {
  id: string
  type?: string // authorizations | captures | refunds | voids
  _type?: string
  number?: string
  currency_code?: string
  amount_cents?: number
  amount_float?: number
  succeeded?: boolean
  gateway_transaction_id?: string
  message?: string
  error_code?: string
  error_detail?: string
  token?: string
  created_at?: string
  updated_at?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

function mapKind(type: string | undefined): TransactionKind | undefined {
  if (!type) return undefined
  const t = type.toLowerCase()
  if (t === 'authorizations' || t === 'authorization') return 'AUTHORIZATION'
  if (t === 'captures' || t === 'capture') return 'CAPTURE'
  if (t === 'refunds' || t === 'refund') return 'REFUND'
  if (t === 'voids' || t === 'void') return 'VOID'
  return undefined
}

function mapStatus(succeeded: boolean | undefined): TransactionStatus {
  if (succeeded === true) return 'SUCCESS'
  if (succeeded === false) return 'FAILURE'
  return 'PENDING'
}

export function transformTransaction(raw: RawCLTransaction): Transaction {
  const rels = raw._relationships as Record<string, { data?: { id: string } | null }> | undefined
  const currency = raw.currency_code ?? 'USD'
  const resourceType = raw._type ?? raw.type

  return {
    id: raw.id,
    orderId: rels?.['order']?.data?.id,
    kind: mapKind(resourceType),
    status: mapStatus(raw.succeeded),
    amount: raw.amount_cents != null
      ? { amount: Math.round(raw.amount_cents), currency }
      : undefined,
    gateway: raw.gateway_transaction_id,
    authorizationCode: raw.token,
    errorCode: raw.error_code,
    errorMessage: raw.error_detail ?? raw.message,
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCapture(
  data: Partial<Transaction>,
): Record<string, unknown> {
  return {
    data: {
      type: 'captures',
      attributes: {},
      relationships: {
        order: {
          data: data.orderId
            ? { type: 'orders', id: data.orderId }
            : undefined,
        },
      },
    },
  }
}
