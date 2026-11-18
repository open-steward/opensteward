/**
 * Pagar.me v5 payment-method transform.
 *
 * Endpoint: GET /customers/{customerId}/cards
 * Pagar.me stores saved payment instruments as **cards** under a customer.
 * The canonical PaymentMethod maps to these card objects.
 *
 * Card types in Pagar.me: credit, debit, voucher — all map to canonical
 * `card`. Pagar.me also supports boleto and pix, but those are not stored
 * as reusable card objects.
 *
 * Refs:
 *   https://github.com/pagarme/pagarme-ruby-sdk/blob/main/doc/models/get-card-response.md
 *   https://pkg.go.dev/github.com/mobilemindtec/go-payments/pagarme/v5 (PagarmeCard.List)
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawPagarmeCard {
  id?: string
  last_four_digits?: string
  first_six_digits?: string
  brand?: string
  holder_name?: string
  holder_document?: string
  exp_month?: number
  exp_year?: number
  status?: string
  type?: string
  label?: string
  customer?: { id?: string; [k: string]: unknown }
  billing_address?: Record<string, unknown>
  created_at?: string
  updated_at?: string
  deleted_at?: string
  metadata?: Record<string, string>
  [k: string]: unknown
}

export function transformPaymentMethod(
  raw: RawPagarmeCard,
  customerId?: string,
): PaymentMethod {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: customerId ?? (raw.customer?.id ? String(raw.customer.id) : undefined),
    type: 'card',
    brand: raw.brand ?? undefined,
    last4: raw.last_four_digits ?? undefined,
    expMonth: raw.exp_month ?? undefined,
    expYear: raw.exp_year ?? undefined,
    holderName: raw.holder_name ?? undefined,
    isDefault: undefined,
    fingerprint: undefined,
    gateway: 'pagarme',
    metadata: strMap({
      ...raw.metadata,
      type: raw.type,
      label: raw.label,
      first_six_digits: raw.first_six_digits,
      holder_document: raw.holder_document,
      status: raw.status,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.deleted_at),
    raw,
  }
}
