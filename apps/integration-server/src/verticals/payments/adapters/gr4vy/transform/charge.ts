import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, pickStr, strMap } from './shared'

/**
 * A Gr4vy *transaction* maps to a canonical Charge. Money is already in integer
 * minor units. `status` is a fine-grained authorization/capture lifecycle that
 * we collapse onto the canonical `ChargeStatus`.
 *
 * Docs: https://docs.gr4vy.com/reference/transactions/get-transaction
 *       https://docs.gr4vy.com/guides/api/statuses/transactions
 */
export interface RawGr4vyTransaction {
  id?: string
  reconciliation_id?: string
  merchant_account_id?: string
  status?: string
  intent?: string
  amount?: number
  authorized_amount?: number
  captured_amount?: number
  refunded_amount?: number
  currency?: string
  country?: string
  external_identifier?: string
  error_code?: string
  disputed?: boolean
  buyer?: { id?: string; display_name?: string; external_identifier?: string } | null
  payment_method?: { id?: string; method?: string; scheme?: string; label?: string } | null
  metadata?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawGr4vyTransaction): ChargeStatus {
  if (raw.disputed) return 'disputed'
  const refunded = raw.refunded_amount ?? 0
  const captured = raw.captured_amount ?? 0
  switch ((raw.status ?? '').toLowerCase()) {
    case 'capture_succeeded':
      if (refunded > 0 && captured > 0 && refunded >= captured) return 'refunded'
      if (refunded > 0) return 'partially_refunded'
      return 'succeeded'
    case 'authorization_succeeded':
    case 'capture_pending':
    case 'processing':
    case 'buyer_approval_pending':
    case 'authorization_void_pending':
      return 'pending'
    case 'authorization_declined':
    case 'authorization_failed':
      return 'failed'
    case 'authorization_voided':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawGr4vyTransaction): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: pickStr(raw.external_identifier) ?? String(raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    amountRefunded: raw.refunded_amount ?? undefined,
    amountCaptured: raw.captured_amount ?? undefined,
    status: mapStatus(raw),
    captured: (raw.captured_amount ?? 0) > 0 || undefined,
    customerId: pickStr(raw.buyer?.id),
    paymentMethodId: pickStr(raw.payment_method?.id),
    failureCode: pickStr(raw.error_code),
    gateway: 'gr4vy',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      reconciliation_id: raw.reconciliation_id,
      merchant_account_id: raw.merchant_account_id,
      intent: raw.intent,
      country: raw.country,
      payment_method_scheme: raw.payment_method?.scheme,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
