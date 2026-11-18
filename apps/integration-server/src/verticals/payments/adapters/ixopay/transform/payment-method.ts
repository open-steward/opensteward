import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { toIsoDatetime } from '@opensteward/shared'
import { pickStr, strMap } from './shared'

/**
 * IXOPAY stored payment instrument, returned in `returnData` after a
 * `POST /transaction/{apiKey}/register` (or a debit/preauthorize with
 * `withRegister: true`). IXOPAY supports three returnData variants:
 *
 * - ReturnCardData   — card payments
 * - ReturnIbanData   — direct debit / SEPA
 * - ReturnWalletData — digital wallets
 *
 * The `paymentToken` returned in the customer-profile context acts as the
 * stored-instrument reference for future charges. There is no dedicated
 * payment-method list/get endpoint; instruments are discovered via the
 * customer profile (`customerProfiles/{apiKey}/getProfile`).
 *
 * Docs: https://documentation.ixopay.com/api/transaction/register
 *       https://gateway.ixopay.com/Schema/V3/OpenApiSpecification.yml
 */

/** Card details nested in TransactionResponse.returnData. */
export interface ReturnCardData {
  cardHolder?: string
  /** e.g. VISA, MASTERCARD */
  type?: string
  /** Numeric month 1–12 */
  expiryMonth?: number | string
  expiryYear?: number | string
  lastFourDigits?: string
  /** Card network brand from BIN lookup */
  binBrand?: string
  fingerprint?: string
  [k: string]: unknown
}

/** IBAN / direct-debit details nested in TransactionResponse.returnData. */
export interface ReturnIbanData {
  accountOwner?: string
  iban?: string
  bic?: string
  mandateId?: string
  bankName?: string
  country?: string
  [k: string]: unknown
}

/** Digital wallet details nested in TransactionResponse.returnData. */
export interface ReturnWalletData {
  walletReferenceId?: string
  walletOwner?: string
  walletType?: string
  [k: string]: unknown
}

/**
 * The full IXOPAY register / withRegister transaction response. The canonical
 * payment-method is built from the `returnData` discriminated union; the outer
 * `uuid` becomes the stored-instrument reference (`paymentToken`).
 */
export interface RawIxopayRegister {
  success?: boolean
  returnType?: string
  uuid?: string
  purchaseId?: string
  merchantTransactionId?: string
  paymentMethod?: string
  returnData?: ReturnCardData & ReturnIbanData & ReturnWalletData & Record<string, unknown>
  extraData?: Record<string, unknown>
  errors?: Array<{ message?: string; code?: number | string }>
  [k: string]: unknown
}

function pickType(raw: RawIxopayRegister): PaymentMethodType {
  const pm = (raw.paymentMethod ?? '').toUpperCase()
  const rd = raw.returnData ?? {}
  if ('lastFourDigits' in rd || 'expiryMonth' in rd || 'cardHolder' in rd) return 'card'
  if ('iban' in rd || 'bic' in rd) return 'bank_account'
  if ('walletType' in rd || 'walletReferenceId' in rd) return 'wallet'
  if (pm.includes('CARD')) return 'card'
  if (pm.includes('SEPA') || pm.includes('IBAN') || pm.includes('BANK')) return 'bank_account'
  if (pm.includes('WALLET') || pm.includes('PAYPAL') || pm.includes('APPLE') || pm.includes('GOOGLE')) return 'wallet'
  return 'other'
}

export function transformPaymentMethod(raw: RawIxopayRegister): PaymentMethod {
  const rd = raw.returnData ?? {}
  const type = pickType(raw)
  const expMonth = rd.expiryMonth !== undefined ? Number(rd.expiryMonth) : undefined
  const expYear = rd.expiryYear !== undefined ? Number(rd.expiryYear) : undefined
  return {
    id: String(raw.uuid ?? raw.merchantTransactionId ?? ''),
    externalId: String(raw.uuid ?? ''),
    type,
    brand: pickStr(rd.binBrand ?? rd.type ?? rd.walletType),
    last4: pickStr(rd.lastFourDigits),
    expMonth: Number.isFinite(expMonth) ? expMonth : undefined,
    expYear: Number.isFinite(expYear) ? expYear : undefined,
    holderName: pickStr(rd.cardHolder ?? rd.accountOwner ?? rd.walletOwner),
    bankName: pickStr(rd.bankName),
    fingerprint: pickStr(rd.fingerprint),
    gateway: 'ixopay',
    metadata: strMap({
      merchantTransactionId: raw.merchantTransactionId,
      purchaseId: raw.purchaseId,
      paymentMethod: raw.paymentMethod,
      iban: rd.iban,
      bic: rd.bic,
      mandateId: rd.mandateId,
      walletReferenceId: rd.walletReferenceId,
      ...raw.extraData,
    }),
    createdAt: toIsoDatetime(raw.extraData?.['createdAt']),
    raw,
  }
}
