import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, pickMoney, strMap, type BoltMoney } from './shared'

/**
 * A Bolt merchant transaction. Bolt identifies transactions by their
 * `transaction_reference` (e.g. `LBLJ-TWW7-R9VC`). `amount` is integer minor
 * units (cents) and may arrive flat (with a sibling `currency`) or nested as
 * an `{ amount, currency }` object.
 */
export interface RawBoltTransaction {
  id?: string
  reference?: string
  transaction_reference?: string
  status?: string
  amount?: BoltMoney
  captured_amount?: BoltMoney
  refunded_amount?: BoltMoney
  currency?: string
  type?: string
  processor?: string
  order_reference?: string
  reason?: string
  failure_reason?: string
  /** Bolt account / shopper this transaction belongs to. */
  account_id?: string
  shopper?: { id?: string; email?: string }
  from_consumer?: { id?: string; email?: string }
  date_created?: string
  date_authorized?: string
  date_captured?: string
  created_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

/**
 * Map Bolt's transaction status onto the canonical charge status. Bolt's
 * dashboard exposes Authorized, Completed, Cancelled, Failed Authorization,
 * In Progress / In Review (pending), and Rejected; the API uses the snake_case
 * forms of these.
 */
function mapStatus(raw: RawBoltTransaction): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase().replace(/\s+/g, '_')) {
    case 'completed':
    case 'captured':
    case 'authorized':
    case 'succeeded':
      return 'succeeded'
    case 'pending':
    case 'in_progress':
    case 'in_review':
    case 'in_re-review':
    case 'in_rereview':
      return 'pending'
    case 'cancelled':
    case 'canceled':
    case 'voided':
      return 'cancelled'
    case 'failed':
    case 'failed_authorization':
    case 'rejected':
    case 'recently_rejected':
    case 'permanently_rejected':
      return 'failed'
    case 'refunded':
      return 'refunded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawBoltTransaction): Charge {
  const reference = raw.transaction_reference ?? raw.reference ?? raw.id ?? ''
  const money = pickMoney(raw.amount)
  const captured = pickMoney(raw.captured_amount)
  const refunded = pickMoney(raw.refunded_amount)
  const status = mapStatus(raw)
  const customerId = raw.account_id ?? raw.shopper?.id ?? raw.from_consumer?.id
  const email = raw.shopper?.email ?? raw.from_consumer?.email

  return {
    id: String(reference),
    externalId: String(reference),
    amount: money.amount,
    currency: pickCurrency(money.currency ?? raw.currency),
    amountCaptured: raw.captured_amount != null ? captured.amount : undefined,
    amountRefunded: raw.refunded_amount != null ? refunded.amount : undefined,
    status,
    captured: status === 'succeeded' ? true : undefined,
    customerId: customerId ? String(customerId) : undefined,
    invoiceId: raw.order_reference ? String(raw.order_reference) : undefined,
    receiptEmail: email,
    failureMessage: raw.failure_reason ?? raw.reason,
    gateway: 'bolt',
    metadata: strMap({
      ...raw.metadata,
      type: raw.type,
      processor: raw.processor,
      order_reference: raw.order_reference,
    }),
    createdAt: toIsoDatetime(raw.date_created ?? raw.created_at),
    updatedAt: toIsoDatetime(raw.date_captured ?? raw.date_authorized),
    raw,
  }
}
