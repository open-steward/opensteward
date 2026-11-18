/**
 * Cybersource Payment Method (Payment Instrument) transform.
 *
 * Cybersource Token Management Service (TMS) stores tokenised payment methods
 * as "Payment Instruments":
 *   GET /tms/v1/paymentinstruments/{paymentInstrumentId}   — get by ID
 *
 * There is no platform-level list endpoint for all payment instruments
 * independent of a customer; instruments are accessed via customer tokens.
 * Customer-linked instruments are retrievable via:
 *   GET /tms/v1/customers/{customerId}/payment-instruments/{id}
 *
 * Docs: https://developer.cybersource.com/docs/cybs/en-us/tms/developer/ctv/rest/tms.html
 */

import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawCybersourcePaymentInstrument {
  id?: string
  default?: boolean
  state?: string
  card?: {
    expirationMonth?: string
    expirationYear?: string
    type?: string
    suffix?: string
    prefix?: string
    accountEncodingIndicator?: string
    issueNumber?: string
  }
  bankAccount?: {
    type?: string
    routingNumber?: string
    suffix?: string
    bankName?: string
  }
  buyerInformation?: {
    currency?: string
  }
  billTo?: {
    firstName?: string
    lastName?: string
    email?: string
  }
  _embedded?: {
    customer?: { id?: string }
    instrumentIdentifier?: { id?: string; card?: { number?: string } }
  }
  submitTimeUtc?: string
  lastModifiedTime?: string
  [k: string]: unknown
}

function mapType(raw: RawCybersourcePaymentInstrument): PaymentMethodType {
  if (raw.card) return 'card'
  if (raw.bankAccount) return 'bank_account'
  return 'other'
}

export function transformPaymentMethod(raw: RawCybersourcePaymentInstrument): PaymentMethod {
  const card = raw.card
  const bank = raw.bankAccount
  const customerId = raw._embedded?.customer?.id

  // The masked card number in TMS looks like "411111XXXX1112"; suffix = last 4
  const last4 = card?.suffix ?? undefined
  const expMonth = card?.expirationMonth ? parseInt(card.expirationMonth, 10) : undefined
  const expYear = card?.expirationYear ? parseInt(card.expirationYear, 10) : undefined

  const holderName = raw.billTo
    ? [raw.billTo.firstName, raw.billTo.lastName].filter(Boolean).join(' ').trim() || undefined
    : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: customerId ?? undefined,
    type: mapType(raw),
    brand: card?.type ?? undefined,
    last4,
    expMonth: Number.isFinite(expMonth) ? expMonth : undefined,
    expYear: Number.isFinite(expYear) ? expYear : undefined,
    holderName,
    bankName: bank?.bankName ?? undefined,
    isDefault: raw.default ?? undefined,
    gateway: 'cybersource',
    metadata: strMap({
      state: raw.state,
      bankAccountType: bank?.type,
      bankRoutingSuffix: bank?.suffix,
    }),
    createdAt: raw.submitTimeUtc ?? undefined,
    updatedAt: raw.lastModifiedTime ?? undefined,
    raw,
  }
}
