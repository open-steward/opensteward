import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawPayPalCapture {
  id?: string
  status?: string
  amount?: { value?: string; currency_code?: string }
  custom_id?: string
  invoice_id?: string
  description?: string
  create_time?: string
  update_time?: string
  payer?: { payer_id?: string; email_address?: string }
  seller_protection?: { status?: string }
  links?: Array<{ rel: string; href: string }>
  [k: string]: unknown
}

function mapStatus(raw: RawPayPalCapture): ChargeStatus {
  switch (raw.status) {
    case 'COMPLETED':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'FAILED':
    case 'DECLINED':
      return 'failed'
    case 'REFUNDED':
      return 'refunded'
    case 'PARTIALLY_REFUNDED':
      return 'partially_refunded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawPayPalCapture): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: decimalToMinor(raw.amount?.value),
    currency: pickCurrency(raw.amount?.currency_code),
    status: mapStatus(raw),
    customerId: raw.payer?.payer_id ?? undefined,
    description: raw.description,
    gateway: 'paypal',
    metadata: strMap({ custom_id: raw.custom_id, invoice_id: raw.invoice_id }),
    createdAt: raw.create_time,
    updatedAt: raw.update_time,
    raw,
  }
}
