import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

/**
 * Cashfree Token Vault saved instrument
 * (`GET /customers/{customer_id}/instruments` — query param `instrument_type=card`).
 *
 * Cashfree's Token Vault currently stores only card instruments. The canonical
 * `type` is always `card`. There is no list-all-customers endpoint, so callers
 * must supply `params.customerId`.
 */
export interface RawCashfreeInstrument {
  customer_id?: string
  instrument_id?: string
  instrument_type?: string
  instrument_uid?: string | null
  instrument_display?: string | null
  instrument_status?: string
  afa_reference?: string | null
  created_at?: string
  instrument_meta?: {
    card_network?: string | null
    card_bank_name?: string | null
    card_country?: string | null
    card_type?: string | null
    card_sub_type?: string | null
    card_token_details?: {
      par?: string | null
      expiry_month?: string | null
      expiry_year?: string | null
      [k: string]: unknown
    } | null
    [k: string]: unknown
  } | null
  [k: string]: unknown
}

function mapType(raw: string | undefined): PaymentMethodType {
  switch ((raw ?? '').toLowerCase()) {
    case 'card':
      return 'card'
    default:
      return 'other'
  }
}

/** Extract last-4 from instrument_display (e.g. "XXXXXXXXXXXX4242" or "4242"). */
function parseLast4(display: string | null | undefined): string | undefined {
  if (!display) return undefined
  const digits = display.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : undefined
}

export function transformPaymentMethod(raw: RawCashfreeInstrument): PaymentMethod {
  const id = String(raw.instrument_id ?? '')
  const meta = raw.instrument_meta
  const tokenDetails = meta?.card_token_details

  const expMonthRaw = tokenDetails?.expiry_month
  const expYearRaw = tokenDetails?.expiry_year
  const expMonth = expMonthRaw ? parseInt(expMonthRaw, 10) : undefined
  const expYear = expYearRaw ? parseInt(expYearRaw, 10) : undefined

  return {
    id,
    externalId: id,
    customerId: raw.customer_id ? String(raw.customer_id) : undefined,
    type: mapType(raw.instrument_type),
    brand: meta?.card_network?.toLowerCase() ?? undefined,
    last4: parseLast4(raw.instrument_display),
    expMonth: Number.isFinite(expMonth) ? expMonth : undefined,
    expYear: Number.isFinite(expYear) ? expYear : undefined,
    bankName: meta?.card_bank_name ?? undefined,
    isDefault: false,
    fingerprint: raw.instrument_uid ?? undefined,
    gateway: 'cashfree',
    metadata: strMap({
      instrument_uid: raw.instrument_uid,
      card_type: meta?.card_type,
      card_sub_type: meta?.card_sub_type,
      card_country: meta?.card_country,
      instrument_status: raw.instrument_status,
      afa_reference: raw.afa_reference,
    }),
    createdAt: toIsoDatetime(raw.created_at) ?? undefined,
    raw,
  }
}
