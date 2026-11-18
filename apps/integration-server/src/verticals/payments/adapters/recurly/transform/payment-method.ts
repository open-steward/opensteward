/**
 * Recurly PaymentMethod transform.
 *
 * Recurly stores payment instruments as "Billing Info" on each account
 * (accessible via GET /accounts/{account_code}/billing_info). The
 * billing_info object contains card details when the payment method is
 * a card.
 *
 * Docs: https://developers.recurly.com/api/v2021-02-25#tag/Billing-Information
 */

import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawRecurlyBillingInfo {
  id?: string
  account?: { id?: string; code?: string }
  payment_method?: {
    object?: string
    card_type?: string
    first_six?: string
    last_four?: string
    exp_month?: number
    exp_year?: number
    billing_agreement_id?: string
  }
  first_name?: string
  last_name?: string
  company?: string
  address?: { street1?: string; street2?: string; city?: string; region?: string; postal_code?: string; country?: string }
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapType(obj: string | undefined): PaymentMethodType {
  const v = (obj ?? '').toLowerCase()
  if (v === 'credit_card' || v === 'card') return 'card'
  if (v === 'paypal_billing_agreement' || v === 'paypal') return 'wallet'
  if (v === 'bank_account_info' || v === 'bank_account' || v === 'ach' || v === 'bacs') return 'bank_account'
  if (v === 'amazon_billing_agreement' || v === 'amazon') return 'wallet'
  return 'other'
}

export function transformPaymentMethod(raw: RawRecurlyBillingInfo): PaymentMethod {
  const pm = raw.payment_method
  const id = raw.id ?? raw.account?.id ?? ''
  const holderName = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim() || undefined

  return {
    id,
    externalId: id,
    customerId: raw.account?.id ?? raw.account?.code ?? undefined,
    type: mapType(pm?.object),
    brand: pm?.card_type ?? undefined,
    last4: pm?.last_four ?? undefined,
    expMonth: pm?.exp_month ?? undefined,
    expYear: pm?.exp_year ?? undefined,
    holderName,
    gateway: 'recurly',
    metadata: strMap({
      firstSix: pm?.first_six,
      company: raw.company,
      billingAgreementId: pm?.billing_agreement_id,
    }),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
    raw,
  }
}
