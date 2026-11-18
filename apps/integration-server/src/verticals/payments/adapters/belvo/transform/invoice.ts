/**
 * Belvo fiscal invoice → canonical Invoice.
 *
 * Belvo's `/api/invoices/` endpoint returns Mexican fiscal tax documents
 * (CFDI) retrieved from the SAT (Servicio de Administración Tributaria).
 * These are NOT billing invoices — they are government-mandated electronic
 * tax receipts (Ingreso/Egreso/Nómina/Pago/Traslado). We surface them
 * through the canonical Invoice schema as the closest available fit:
 *
 *   - status: "Vigente" → "paid" (valid/in-force); "Cancelado" → "void"
 *   - sender / receiver are mapped to customerId (the link's fiscal entity)
 *   - amounts are already in major units (MXN decimals) and scaled to minor
 *   - `number` carries invoice_identification (the CFDI UUID)
 *
 * Docs: https://developers.belvo.com/apis/belvoopenapispec/invoices/detailinvoice.md
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

export interface RawBelvoInvoiceDetail {
  id?: string
  link?: string | null
  collected_at?: string | null
  created_at?: string | null
  invoice_identification?: string | null
  invoice_date?: string | null
  /** Belvo direction: INFLOW | OUTFLOW */
  type?: string | null
  /**
   * SAT invoice classification:
   *   Egreso (expenditure), Ingreso (income), Nómina (payroll),
   *   Pago (payment supplement), Traslado (transfer/waybill)
   */
  invoice_type?: string | null
  /** "Vigente" (valid) or "Cancelado" (cancelled) */
  status?: string | null
  cancelation_status?: string | null
  sender_id?: string | null
  sender_name?: string | null
  sender_fiscal_regime?: string | null
  receiver_id?: string | null
  receiver_name?: string | null
  receiver_fiscal_regime?: string | null
  receiver_postal_code?: string | null
  subtotal_amount?: number | null
  tax_amount?: number | null
  discount_amount?: number | null
  total_amount?: number | null
  currency?: string | null
  exchange_rate?: number | null
  payment_type?: string | null
  payment_method?: string | null
  folio?: string | null
  series?: string | null
  version?: string | null
  place_of_issue?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawBelvoInvoiceDetail): InvoiceStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'cancelado' || s.includes('cancel')) return 'void'
  // "Vigente" = in-force / valid; treat as paid for fiscal invoices
  return 'paid'
}

export function transformInvoice(raw: RawBelvoInvoiceDetail): Invoice {
  const total = toMinorUnits(raw.total_amount) ?? 0
  const subtotal = toMinorUnits(raw.subtotal_amount)
  const tax = toMinorUnits(raw.tax_amount)
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.id) ?? '',
    number: pickStr(raw.invoice_identification ?? raw.folio) ?? undefined,
    // For fiscal invoices the link's account holder is the party — use
    // sender_id as the customerId anchor when available.
    customerId: pickStr(raw.sender_id ?? raw.receiver_id) ?? undefined,
    status: mapStatus(raw),
    currency: pickCurrency(raw.currency),
    subtotal: subtotal,
    tax: tax,
    total,
    amountDue: mapStatus(raw) === 'void' ? undefined : 0,
    amountPaid: mapStatus(raw) === 'paid' ? total : 0,
    amountRemaining: 0,
    paidAt: mapStatus(raw) === 'paid' ? toIsoDatetime(raw.invoice_date ?? raw.collected_at) : undefined,
    gateway: 'belvo',
    metadata: strMap({
      type: raw.type,
      invoice_type: raw.invoice_type,
      status: raw.status,
      sender_id: raw.sender_id,
      sender_name: raw.sender_name,
      sender_fiscal_regime: raw.sender_fiscal_regime,
      receiver_id: raw.receiver_id,
      receiver_name: raw.receiver_name,
      receiver_fiscal_regime: raw.receiver_fiscal_regime,
      payment_type: raw.payment_type,
      payment_method: raw.payment_method,
      version: raw.version,
      exchange_rate: raw.exchange_rate,
      cancelation_status: raw.cancelation_status,
    }),
    createdAt: toIsoDatetime(raw.invoice_date ?? raw.collected_at),
    updatedAt: toIsoDatetime(raw.collected_at ?? raw.created_at),
    raw,
  }
}
