import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

/**
 * Tap saved-card object — https://developers.tap.company/reference/list-all-cards
 *
 * Cards are scoped to a customer. Retrieve via:
 *   GET /v2/card/{customer_id}          — list (returns "cards" array)
 *   GET /v2/card/{customer_id}/{card_id} — single card
 */
export interface RawTapCard {
  id?: string
  object?: string
  created?: string | number
  live_mode?: boolean
  customer?: string
  /** "CREDIT" | "DEBIT" | "PREPAID" */
  funding?: string
  fingerprint?: string
  /** "VISA" | "MASTERCARD" | "AMEX" | "MADA" | … */
  brand?: string
  scheme?: string
  name?: string
  exp_month?: number | string
  exp_year?: number | string
  last_four?: string
  first_six?: string
  address?: Record<string, unknown>
  [k: string]: unknown
}

function mapType(raw: RawTapCard): PaymentMethodType {
  const b = (raw.brand ?? raw.scheme ?? '').toUpperCase()
  if (b === 'APPLE_PAY' || b === 'GOOGLE_PAY' || b === 'SAMSUNG_PAY') return 'wallet'
  return 'card'
}

export function transformPaymentMethod(raw: RawTapCard): PaymentMethod {
  const created = toIsoDatetime(raw.created)
  const expYear =
    raw.exp_year != null
      ? Number(raw.exp_year) < 100
        ? 2000 + Number(raw.exp_year)
        : Number(raw.exp_year)
      : undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer ? String(raw.customer) : undefined,
    type: mapType(raw),
    brand: raw.brand ? (raw.brand as string).toLowerCase() : undefined,
    last4: raw.last_four ?? undefined,
    expMonth: raw.exp_month != null ? Number(raw.exp_month) : undefined,
    expYear,
    holderName: raw.name ?? undefined,
    fingerprint: raw.fingerprint ?? undefined,
    gateway: 'tap-payments',
    metadata: strMap({
      funding: raw.funding,
      scheme: raw.scheme,
      first_six: raw.first_six,
    }),
    createdAt: created,
    updatedAt: created,
    raw,
  }
}
