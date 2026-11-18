import type { Refund, RefundStatus } from '../../../schema/refund'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawPayPalRefund {
  id?: string
  status?: string
  amount?: { value?: string; currency_code?: string }
  note_to_payer?: string
  invoice_id?: string
  create_time?: string
  update_time?: string
  links?: Array<{ rel: string; href: string }>
  [k: string]: unknown
}

function mapStatus(raw: RawPayPalRefund): RefundStatus {
  switch (raw.status) {
    case 'COMPLETED':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'CANCELLED':
      return 'cancelled'
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

function chargeIdFromLinks(raw: RawPayPalRefund): string {
  const up = raw.links?.find((l) => l.rel === 'up')?.href
  if (!up) return ''
  return up.split('/').pop() ?? ''
}

export function transformRefund(raw: RawPayPalRefund): Refund {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    chargeId: chargeIdFromLinks(raw),
    amount: decimalToMinor(raw.amount?.value),
    currency: pickCurrency(raw.amount?.currency_code),
    status: mapStatus(raw),
    gateway: 'paypal',
    metadata: strMap({ invoice_id: raw.invoice_id, note: raw.note_to_payer }),
    createdAt: raw.create_time,
    updatedAt: raw.update_time,
    raw,
  }
}
