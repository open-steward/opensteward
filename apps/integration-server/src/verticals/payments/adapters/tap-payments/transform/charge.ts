import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/** Tap charge object — https://developers.tap.company/reference/charges */
export interface RawTapCharge {
  id?: string
  object?: string
  status?: string
  amount?: number | string
  currency?: string
  description?: string | null
  statement_descriptor?: string | null
  metadata?: Record<string, unknown>
  customer?: {
    id?: string
    first_name?: string
    middle_name?: string
    last_name?: string
    email?: string
  }
  source?: { id?: string; type?: string; payment_method?: string }
  receipt?: { id?: string; email?: boolean; sms?: boolean }
  reference?: { payment?: string; gateway?: string; acquirer?: string; transaction?: string }
  response?: { code?: string; message?: string }
  transaction?: {
    authorization_id?: string
    created?: string | number
    timezone?: string
    amount?: number | string
    currency?: string
  }
  [k: string]: unknown
}

/**
 * Tap charge statuses:
 *   INITIATED, ABANDONED, CANCELLED, FAILED, DECLINED, RESTRICTED,
 *   CAPTURED, VOID, TIMEDOUT, UNKNOWN.
 */
const FAILED_STATUSES = ['FAILED', 'DECLINED', 'TIMEDOUT', 'RESTRICTED']

function mapStatus(raw: RawTapCharge): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'CAPTURED':
      return 'succeeded'
    case 'INITIATED':
      return 'pending'
    case 'FAILED':
    case 'DECLINED':
    case 'TIMEDOUT':
    case 'RESTRICTED':
      return 'failed'
    case 'CANCELLED':
    case 'ABANDONED':
    case 'VOID':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawTapCharge): Charge {
  const currency = pickCurrency(raw.currency)
  const status = (raw.status ?? '').toUpperCase()
  const failed = FAILED_STATUSES.includes(status)
  const captured = status === 'CAPTURED'
  const created = toIsoDatetime(raw.transaction?.created)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: toMinorUnits(raw.amount, currency),
    currency,
    status: mapStatus(raw),
    captured,
    capturedAt: captured ? created : undefined,
    customerId: raw.customer?.id ? String(raw.customer.id) : undefined,
    paymentMethodId: raw.source?.id ? String(raw.source.id) : undefined,
    description: raw.description ?? undefined,
    statementDescriptor: raw.statement_descriptor ?? undefined,
    failureCode: failed ? raw.response?.code : undefined,
    failureMessage: failed ? raw.response?.message : undefined,
    receiptEmail: raw.customer?.email,
    gateway: 'tap-payments',
    metadata: strMap({
      ...raw.metadata,
      payment_reference: raw.reference?.payment,
      gateway_reference: raw.reference?.gateway,
      source_type: raw.source?.type,
    }),
    createdAt: created,
    updatedAt: created,
    raw,
  }
}
