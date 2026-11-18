import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

/**
 * Authorize.Net stores payment info in "payment profiles" (CIM).
 * A customer profile can have multiple payment profiles each containing
 * a card or bank account.
 */
export interface RawAuthNetCreditCard {
  cardNumber?: string
  cardType?: string
  expirationDate?: string
}

export interface RawAuthNetBankAccount {
  bankName?: string
  routingNumber?: string
  accountNumber?: string
  accountType?: string
}

export interface RawAuthNetPaymentProfile {
  customerPaymentProfileId?: string
  customerProfileId?: string
  defaultPaymentProfile?: boolean
  billTo?: { firstName?: string; lastName?: string; [k: string]: unknown }
  payment?: {
    creditCard?: RawAuthNetCreditCard
    bankAccount?: RawAuthNetBankAccount
    [k: string]: unknown
  }
  [k: string]: unknown
}

function mapType(raw: RawAuthNetPaymentProfile): PaymentMethodType {
  if (raw.payment?.creditCard) return 'card'
  if (raw.payment?.bankAccount) return 'bank_account'
  return 'other'
}

export function transformPaymentMethod(raw: RawAuthNetPaymentProfile): PaymentMethod {
  const card = raw.payment?.creditCard
  const bank = raw.payment?.bankAccount

  let last4: string | undefined
  if (card?.cardNumber) {
    const s = String(card.cardNumber)
    last4 = s.length >= 4 ? s.slice(-4) : s
  } else if (bank?.accountNumber) {
    const s = String(bank.accountNumber)
    last4 = s.length >= 4 ? s.slice(-4) : s
  }

  let expMonth: number | undefined
  let expYear: number | undefined
  if (card?.expirationDate) {
    // Authorize.Net format: YYYY-MM or XXXX
    const parts = card.expirationDate.split('-')
    if (parts.length === 2) {
      expYear = parseInt(parts[0], 10) || undefined
      expMonth = parseInt(parts[1], 10) || undefined
    }
  }

  const holderName = [raw.billTo?.firstName, raw.billTo?.lastName]
    .filter(Boolean)
    .join(' ') || undefined

  return {
    id: String(raw.customerPaymentProfileId ?? ''),
    externalId: String(raw.customerPaymentProfileId ?? ''),
    customerId: raw.customerProfileId != null ? String(raw.customerProfileId) : undefined,
    type: mapType(raw),
    brand: card?.cardType ?? undefined,
    last4,
    expMonth,
    expYear,
    holderName,
    bankName: bank?.bankName ?? undefined,
    isDefault: raw.defaultPaymentProfile === true,
    gateway: 'authorize-net',
    metadata: strMap({ customerPaymentProfileId: raw.customerPaymentProfileId }),
    raw,
  }
}
