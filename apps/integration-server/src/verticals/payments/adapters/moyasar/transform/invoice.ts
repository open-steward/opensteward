import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawMoyasarInvoice {
  [k: string]: unknown
}

function mapStatus(s: string | undefined | null): InvoiceStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'paid') return 'paid'
  if (v === 'canceled' || v === 'cancelled' || v === 'voided') return 'void'
  if (v === 'expired' || v === 'failed' || v === 'on_hold') return 'uncollectible'
  if (v === 'initiated') return 'open'
  return 'open'
}

export function transformInvoice(raw: RawMoyasarInvoice): Invoice {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    status: mapStatus(raw['status'] as string | undefined),
    currency: pickCurrency(raw['currency'] as string | undefined, 'SAR'),
    total: safeInt(raw['amount']),
    gateway: 'moyasar',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    updatedAt: raw['updated_at'] != null ? String(raw['updated_at']) : undefined,
    raw,
  }
}
