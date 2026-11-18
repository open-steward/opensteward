import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap, toIso } from './shared'

export interface RawRazorpayTokenCard {
  name?: string
  last4?: string
  network?: string
  type?: string
  issuer?: string
  expiry_month?: number | string
  expiry_year?: number | string
  emi?: boolean
  [k: string]: unknown
}

export interface RawRazorpayToken {
  id?: string
  entity?: string
  method?: string
  token?: string
  customer_id?: string
  card?: RawRazorpayTokenCard
  bank?: string
  wallet?: string
  vpa?: string
  recurring?: boolean
  status?: string
  dcc_enabled?: boolean
  notes?: Record<string, unknown>
  created_at?: number
  expired_at?: number
  [k: string]: unknown
}

function mapType(method: string | undefined): PaymentMethodType {
  switch ((method ?? '').toLowerCase()) {
    case 'card':
      return 'card'
    case 'emandate':
    case 'nach':
    case 'netbanking':
      return 'bank_account'
    case 'wallet':
      return 'wallet'
    case 'upi':
      return 'a2a'
    case 'cardless_emi':
    case 'paylater':
      return 'bnpl'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(
  raw: RawRazorpayToken,
  fallbackCustomerId?: string,
): PaymentMethod {
  const card = raw.card
  const expMonth =
    card?.expiry_month != null ? Number(card.expiry_month) : undefined
  const expYear =
    card?.expiry_year != null ? Number(card.expiry_year) : undefined

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    customerId: raw.customer_id ?? fallbackCustomerId,
    type: mapType(raw.method),
    brand: card?.network ?? raw.wallet,
    last4: card?.last4,
    expMonth: !Number.isNaN(expMonth) ? expMonth : undefined,
    expYear: !Number.isNaN(expYear) ? expYear : undefined,
    holderName: card?.name,
    bankName: raw.bank ?? card?.issuer,
    gateway: 'razorpay',
    metadata: strMap({
      status: raw.status,
      recurring: raw.recurring,
      vpa: raw.vpa,
      wallet: raw.wallet,
      ...raw.notes,
    }),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.expired_at),
    raw,
  }
}
