/**
 * Nuvei getUserUPOs response → canonical PaymentMethod.
 *
 * Nuvei stores saved payment details as UPOs (User Payment Options), retrieved
 * via `getUserUPOs.do`. Each UPO has a `userPaymentOptionId`, a
 * `paymentMethodName` (e.g. "cc_card"), and a `upoData` object that contains
 * card-specific fields (`last4Digits`, `ccCardNumber` masked, `ccExpMonth`,
 * `ccExpYear`, `ccNameOnCard`, `bin`). `upoStatus` indicates whether the UPO
 * is ENABLED or SUSPENDED.
 *
 * Transforms never throw — missing optionals collapse to `undefined`.
 */
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { toIsoDatetime } from '@opensteward/shared'
import { pickStr, strMap } from './shared'

export interface RawNuveiUpoData {
  last4Digits?: string
  ccCardNumber?: string       // masked PAN (e.g. "4111***1111")
  ccExpMonth?: string         // "MM"
  ccExpYear?: string          // "YYYY"
  ccNameOnCard?: string
  bin?: string
  brand?: string
  [k: string]: unknown
}

export interface RawNuveiUPO {
  userPaymentOptionId?: string
  paymentMethodName?: string  // e.g. "cc_card", "apmgw_PayPal"
  upoName?: string            // display name
  upoStatus?: string          // "ENABLED" | "SUSPENDED"
  upoData?: RawNuveiUpoData
  billingAddress?: {
    firstName?: string
    lastName?: string
    address?: string
    city?: string
    zip?: string
    state?: string
    country?: string
    email?: string
    phone?: string
    [k: string]: unknown
  }
  expiryDate?: string         // "MMYYYY" or similar
  issuerCountry?: string
  /** Not returned by API but may be populated by the caller */
  userTokenId?: string
  createdAt?: string
  updatedAt?: string
  [k: string]: unknown
}

export interface RawNuveiGetUserUPOsResponse {
  userTokenId?: string
  paymentMethods?: RawNuveiUPO[]
  status?: string
  errCode?: number
  reason?: string
  [k: string]: unknown
}

function mapType(paymentMethodName: string | undefined): PaymentMethodType {
  const name = (paymentMethodName ?? '').toLowerCase()
  if (name.includes('cc_card') || name.includes('cc_') || name.includes('card')) return 'card'
  if (name.includes('bank') || name.includes('ach') || name.includes('sepa')) return 'bank_account'
  if (name.includes('paypal') || name.includes('apple') || name.includes('google') || name.includes('wallet')) return 'wallet'
  if (name.includes('bnpl') || name.includes('klarna') || name.includes('afterpay')) return 'bnpl'
  return 'other'
}

export function transformPaymentMethod(
  raw: RawNuveiUPO,
  userTokenId?: string,
): PaymentMethod {
  const id = raw.userPaymentOptionId ?? ''
  const upoData = raw.upoData ?? {}
  const type = mapType(raw.paymentMethodName)

  // Parse expiry from separate month/year fields or the expiryDate "MMYYYY" string.
  let expMonth: number | undefined
  let expYear: number | undefined
  if (upoData.ccExpMonth) {
    const m = parseInt(upoData.ccExpMonth, 10)
    if (!Number.isNaN(m)) expMonth = m
  }
  if (upoData.ccExpYear) {
    const y = parseInt(upoData.ccExpYear, 10)
    if (!Number.isNaN(y)) expYear = y
  }
  if (!expMonth && !expYear && raw.expiryDate && raw.expiryDate.length >= 6) {
    const m = parseInt(raw.expiryDate.slice(0, 2), 10)
    const y = parseInt(raw.expiryDate.slice(2, 6), 10)
    if (!Number.isNaN(m)) expMonth = m
    if (!Number.isNaN(y)) expYear = y
  }

  return {
    id: String(id),
    externalId: String(id),
    customerId: pickStr(userTokenId ?? raw.userTokenId),
    type,
    brand: pickStr(upoData.brand ?? upoData.bin),
    last4: pickStr(upoData.last4Digits),
    expMonth,
    expYear,
    holderName: pickStr(upoData.ccNameOnCard),
    bankName: undefined,
    isDefault: undefined,
    fingerprint: undefined,
    gateway: 'nuvei',
    metadata: strMap({
      paymentMethodName: raw.paymentMethodName,
      upoName: raw.upoName,
      upoStatus: raw.upoStatus,
      issuerCountry: raw.issuerCountry,
      bin: upoData.bin,
    }),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    raw,
  }
}
