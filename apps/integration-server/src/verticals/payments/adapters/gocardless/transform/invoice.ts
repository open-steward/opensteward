/**
 * GoCardless `InstalmentSchedule` is the closest canonical match to
 * Invoice — a multi-instalment plan that fires individual payments. v1
 * maps the schedule itself to Invoice; the per-instalment payments map to
 * Charge through the existing transform/charge.ts.
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap } from './shared'

export interface RawGCInstalmentSchedule {
  id?: string
  name?: string
  status?: string
  total_amount?: number
  currency?: string
  payment_reference?: string
  links?: { customer?: string }
  created_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawGCInstalmentSchedule): InvoiceStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'pending':
    case 'active':
      return 'open'
    case 'completed':
      return 'paid'
    case 'cancelled':
      return 'void'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawGCInstalmentSchedule): Invoice {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.payment_reference,
    customerId: raw.links?.customer,
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency),
    total: raw.total_amount ?? 0,
    gateway: 'gocardless',
    metadata: strMap({ name: raw.name }),
    createdAt: raw.created_at,
    raw,
  }
}
