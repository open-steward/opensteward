/**
 * PayPal Vault API → canonical PaymentMethod.
 *
 * The PayPal Vault (`/v3/vault/payment-tokens`) stores saved funding sources
 * tied to a Customer ID. Each token wraps a card, PayPal account, or other
 * payment source. This transform maps one vault token to the canonical
 * PaymentMethod shape.
 *
 * Docs: https://developer.paypal.com/docs/api/payment-tokens/v3/
 */

import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawPayPalVaultTokenCard {
  name?: string | null
  last_digits?: string | null
  brand?: string | null
  expiry?: string | null // "YYYY-MM"
  billing_address?: {
    address_line_1?: string | null
    admin_area_2?: string | null
    postal_code?: string | null
    country_code?: string | null
  } | null
}

export interface RawPayPalVaultTokenPayPal {
  email_address?: string | null
  account_status?: string | null
  vault_id?: string | null
}

export interface RawPayPalVaultToken {
  id?: string | null
  /** Customer link contains the customer ID. */
  customer?: { id?: string | null } | null
  payment_source?: {
    card?: RawPayPalVaultTokenCard | null
    paypal?: RawPayPalVaultTokenPayPal | null
    venmo?: Record<string, unknown> | null
    apple_pay?: Record<string, unknown> | null
    google_pay?: Record<string, unknown> | null
  } | null
  status?: string | null
  create_time?: string | null
  [k: string]: unknown
}

function mapType(raw: RawPayPalVaultToken): PaymentMethodType {
  const src = raw.payment_source ?? {}
  if (src.card) return 'card'
  if (src.paypal || src.venmo) return 'wallet'
  if (src.apple_pay || src.google_pay) return 'wallet'
  return 'other'
}

function parseExpiry(expiry: string | null | undefined): { month?: number; year?: number } {
  // PayPal expiry format: "YYYY-MM"
  if (!expiry) return {}
  const parts = expiry.split('-')
  const year = parts[0] ? parseInt(parts[0], 10) : undefined
  const month = parts[1] ? parseInt(parts[1], 10) : undefined
  return { year, month }
}

export function transformPaymentMethod(raw: RawPayPalVaultToken): PaymentMethod {
  const id = String(raw.id ?? '')
  const card = raw.payment_source?.card ?? undefined
  const paypal = raw.payment_source?.paypal ?? undefined
  const { month, year } = parseExpiry(card?.expiry)

  return {
    id,
    externalId: id,
    customerId: raw.customer?.id ?? undefined,
    type: mapType(raw),
    brand: card?.brand?.toLowerCase() ?? (paypal ? 'paypal' : undefined),
    last4: card?.last_digits ?? undefined,
    expMonth: month,
    expYear: year,
    holderName: card?.name ?? undefined,
    gateway: 'paypal',
    metadata: strMap({
      status: raw.status,
      email_address: paypal?.email_address,
      account_status: paypal?.account_status,
    }),
    createdAt: raw.create_time ?? undefined,
    raw,
  }
}
