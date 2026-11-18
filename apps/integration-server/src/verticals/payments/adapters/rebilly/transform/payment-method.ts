/**
 * Rebilly payment instrument → canonical PaymentMethod
 * (components/schemas/PaymentInstrument.yaml, discriminated on `method`:
 * payment-card → PaymentCard.yaml, ach → BankAccount.yaml, paypal →
 * PayPalAccount.yaml, everything else → AlternativeInstrument.yaml).
 * PaymentCard: `last4` "Last 4 digits of the associated Primary Account
 * Number (PAN).", `brand`, `expMonth`, `expYear`, `fingerprint`, `bankName`.
 */
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { fullName, requireId, str, strMap } from './shared'

export interface RawRebillyPaymentInstrument {
  id?: string
  customerId?: string
  method?: string
  last4?: string
  brand?: string
  expMonth?: number
  expYear?: number
  bankName?: string
  fingerprint?: string
  billingAddress?: { firstName?: string | null; lastName?: string | null } | null
  customFields?: Record<string, unknown>
  createdTime?: string
  updatedTime?: string
  [k: string]: unknown
}

function mapType(method: string | undefined): PaymentMethodType {
  switch (method) {
    case 'payment-card':
      return 'card'
    case 'ach':
      return 'bank_account'
    case 'paypal':
      return 'wallet'
    case undefined:
      return 'unknown'
    default:
      return 'other'
  }
}

function month(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12 ? v : undefined
}

export function transformPaymentMethod(raw: RawRebillyPaymentInstrument): PaymentMethod {
  const id = requireId(raw.id, 'payment instrument id')
  return {
    id,
    externalId: id,
    customerId: str(raw.customerId),
    type: mapType(raw.method),
    brand: str(raw.brand),
    last4: str(raw.last4),
    expMonth: month(raw.expMonth),
    expYear:
      typeof raw.expYear === 'number' && Number.isInteger(raw.expYear) ? raw.expYear : undefined,
    holderName: fullName(raw.billingAddress?.firstName, raw.billingAddress?.lastName),
    bankName: str(raw.bankName),
    fingerprint: str(raw.fingerprint),
    gateway: 'rebilly',
    metadata: strMap(raw.customFields),
    createdAt: str(raw.createdTime),
    updatedAt: str(raw.updatedTime),
    raw,
  }
}
