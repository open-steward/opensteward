import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap, worldlineDateTime } from './shared'

/**
 * Worldline Direct "Token" object. Tokens store card or bank-account details
 * for Card On File / recurring payments. Retrieved via:
 *   GET /v2/{merchantId}/tokens/{tokenId}
 *
 * The token response is discriminated by which sub-object is populated:
 *   - card           → TokenCard
 *   - eWallet        → TokenEWallet
 *   - nonSepaDirectDebit → TokenNonSepaDirectDebit
 *   - sepaDirectDebit → TokenSepaDirectDebit
 *
 * Docs: https://apireference.connect.worldline-solutions.com/s2sapi/v1/en_US/json/tokens/get.html
 */
export interface RawWorldlineTokenCustomer {
  merchantCustomerId?: string
  personalInformation?: {
    name?: {
      firstName?: string
      surname?: string
      surnamePrefix?: string
    }
  }
  contactDetails?: {
    emailAddress?: string
    phoneNumber?: string
  }
  companyInformation?: {
    name?: string
    vatNumber?: string
  }
}

export interface RawWorldlineCardData {
  cardNumber?: string
  cardholderName?: string
  expiryDate?: string // MMYY
}

export interface RawWorldlineBankAccountData {
  accountHolderName?: string
  accountNumber?: string
  bankCode?: string
  iban?: string
}

export interface RawWorldlineTokenCard {
  alias?: string
  customer?: RawWorldlineTokenCustomer
  data?: RawWorldlineCardData
}

export interface RawWorldlineTokenEWallet {
  alias?: string
  customer?: RawWorldlineTokenCustomer
  billingAgreementId?: string
}

export interface RawWorldlineTokenDirectDebit {
  alias?: string
  customer?: RawWorldlineTokenCustomer
  mandate?: {
    bankAccountBban?: RawWorldlineBankAccountData
    bankAccountIban?: RawWorldlineBankAccountData
  }
}

export interface RawWorldlineToken {
  id?: string
  paymentProductId?: number
  issuerId?: string
  card?: RawWorldlineTokenCard
  eWallet?: RawWorldlineTokenEWallet
  nonSepaDirectDebit?: RawWorldlineTokenDirectDebit
  sepaDirectDebit?: RawWorldlineTokenDirectDebit
  /** ISO-8601 or epoch */
  originalPaymentId?: string
  status?: string
  [k: string]: unknown
}

function mapPaymentMethodType(raw: RawWorldlineToken): PaymentMethodType {
  if (raw.card) return 'card'
  if (raw.eWallet) return 'wallet'
  if (raw.nonSepaDirectDebit || raw.sepaDirectDebit) return 'bank_account'
  return 'other'
}

/** Parse Worldline MMYY expiry into month/year numbers. */
function parseExpiry(mmyy: string | undefined): { expMonth?: number; expYear?: number } {
  if (!mmyy || mmyy.length !== 4) return {}
  const mm = Number(mmyy.slice(0, 2))
  const yy = Number(mmyy.slice(2, 4))
  if (Number.isNaN(mm) || Number.isNaN(yy)) return {}
  return { expMonth: mm, expYear: 2000 + yy }
}

/** Mask a card number — return last 4 digits. */
function last4(cardNumber: string | undefined): string | undefined {
  if (!cardNumber) return undefined
  const digits = cardNumber.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : undefined
}

export function transformPaymentMethod(raw: RawWorldlineToken): PaymentMethod {
  const card = raw.card ?? {}
  const cardData = card.data ?? {}
  const { expMonth, expYear } = parseExpiry(cardData.expiryDate)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    type: mapPaymentMethodType(raw),
    brand: undefined,
    last4: last4(cardData.cardNumber),
    expMonth,
    expYear,
    holderName: cardData.cardholderName,
    gateway: 'worldline',
    metadata: strMap({
      paymentProductId: raw.paymentProductId,
      issuerId: raw.issuerId,
      alias: card.alias ?? raw.eWallet?.alias ?? raw.sepaDirectDebit?.alias,
      merchantCustomerId:
        card.customer?.merchantCustomerId ??
        raw.eWallet?.customer?.merchantCustomerId ??
        raw.sepaDirectDebit?.customer?.merchantCustomerId,
      status: raw.status,
    }),
    createdAt: toIsoDatetime(worldlineDateTime(undefined)),
    raw,
  }
}
