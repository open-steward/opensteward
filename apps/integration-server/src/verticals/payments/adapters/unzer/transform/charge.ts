/**
 * Unzer charge / payment ↔ canonical Charge.
 *
 * Unzer returns money as decimal-major-unit strings (`"100.0000"`), so amounts
 * are converted to integer minor units via `toMinorUnits`.
 *
 * Two upstream shapes map onto the canonical Charge:
 *  - A **Payment** aggregate (`GET /v1/payments/{id}`): carries `state.{id,name}`,
 *    an `amount` object (`total` / `charged` / `canceled` / `remaining`),
 *    `orderId`, `resources`, and a `transactions[]` list.
 *  - A **Charge** transaction (`POST /v1/payments/charges`): carries an
 *    `s-chg-…` id, scalar `amount`, and `isSuccess` / `isPending` / `isError`
 *    boolean flags.
 *
 * `transformCharge` accepts either and never throws — missing fields collapse
 * to `undefined`.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawUnzerAmount {
  total?: string
  charged?: string
  canceled?: string
  remaining?: string
}

export interface RawUnzerState {
  id?: number
  name?: string
}

export interface RawUnzerResources {
  customerId?: string
  paymentId?: string
  basketId?: string
  metadataId?: string
  typeId?: string
}

export interface RawUnzerProcessing {
  uniqueId?: string
  shortId?: string
  traceId?: string
}

export interface RawUnzerCharge {
  id?: string
  /** Payment-aggregate shape. */
  state?: RawUnzerState
  /** Payment aggregates carry an amount *object*; charge transactions a string. */
  amount?: RawUnzerAmount | string
  currency?: string
  orderId?: string
  invoiceId?: string
  date?: string
  /** Charge-transaction outcome flags (mutually exclusive). */
  isSuccess?: boolean
  isPending?: boolean
  isError?: boolean
  resources?: RawUnzerResources
  processing?: RawUnzerProcessing
  message?: { merchant?: string; customer?: string }
  [k: string]: unknown
}

/** Map a payment-aggregate `state.name` to a canonical charge status. */
function mapStateName(name: string | undefined): ChargeStatus {
  switch ((name ?? '').toLowerCase()) {
    case 'completed':
      return 'succeeded'
    case 'pending':
    case 'create':
    case 'payment_review':
      return 'pending'
    case 'canceled':
      return 'cancelled'
    case 'partly':
      return 'partially_refunded'
    case 'chargeback':
      return 'disputed'
    default:
      return 'pending'
  }
}

/** Map charge-transaction boolean flags to a canonical charge status. */
function mapFlags(raw: RawUnzerCharge): ChargeStatus {
  if (raw.isError) return 'failed'
  if (raw.isPending) return 'pending'
  if (raw.isSuccess) return 'succeeded'
  return 'pending'
}

function isAmountObject(a: RawUnzerAmount | string | undefined): a is RawUnzerAmount {
  return !!a && typeof a === 'object'
}

export function transformCharge(raw: RawUnzerCharge): Charge {
  const currency = pickCurrency(raw.currency)
  const amountObj = isAmountObject(raw.amount) ? raw.amount : undefined

  const amount = amountObj
    ? toMinorUnits(amountObj.total, currency)
    : toMinorUnits(typeof raw.amount === 'string' ? raw.amount : undefined, currency)

  const amountRefunded = amountObj ? toMinorUnits(amountObj.canceled, currency) : undefined
  const amountCaptured = amountObj ? toMinorUnits(amountObj.charged, currency) : undefined

  const status = raw.state ? mapStateName(raw.state.name) : mapFlags(raw)

  return {
    id: String(raw.id ?? raw.resources?.paymentId ?? ''),
    externalId: String(raw.id ?? raw.resources?.paymentId ?? ''),
    amount,
    currency,
    amountRefunded,
    amountCaptured,
    status,
    captured: amountObj ? (amountCaptured ?? 0) > 0 : raw.isSuccess === true,
    customerId: raw.resources?.customerId || undefined,
    paymentMethodId: raw.resources?.typeId || undefined,
    invoiceId: raw.invoiceId || undefined,
    failureMessage: raw.message?.merchant || raw.message?.customer || undefined,
    gateway: 'unzer',
    metadata: strMap({
      orderId: raw.orderId,
      paymentId: raw.resources?.paymentId,
      typeId: raw.resources?.typeId,
      basketId: raw.resources?.basketId,
      stateName: raw.state?.name,
      shortId: raw.processing?.shortId,
      uniqueId: raw.processing?.uniqueId,
    }),
    createdAt: toIsoDatetime(raw.date),
    raw,
  }
}
