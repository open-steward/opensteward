/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ComarchoptimaInvoiceLine {
  id: string | number
  opis?: string
  cena_netto?: number
  ilosc?: number
  wartosc_netto?: number
  wartosc_vat?: number
  konto_id?: string
  [key: string]: unknown
}

export interface ComarchoptimaInvoice {
  id: string | number
  numer?: string
  data_wystawienia?: string
  termin_platnosci?: string
  wartosc_brutto?: number
  wartosc_netto?: number
  wartosc_vat?: number
  status?: string
  kontrahent_id?: string | number
  waluta?: string
  pozycje?: ComarchoptimaInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): InvoiceStatus {
  switch (s?.toLowerCase()) {
    case 'oplacona': return 'PAID'
    case 'wystawiona': return 'AUTHORIZED'
    case 'anulowana': return 'VOIDED'
    case 'czesciowo_oplacona': return 'PARTIALLY_PAID'
    case 'przeterminowana': return 'OVERDUE'
    default: return 'DRAFT'
  }
}

export function transformInvoice(raw: ComarchoptimaInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.numer || undefined,
    contactId: raw.kontrahent_id ? String(raw.kontrahent_id) : undefined,
    currency: raw.waluta || undefined,
    totalAmount: raw.wartosc_brutto,
    taxAmount: raw.wartosc_vat,
    balanceAmount: raw.wartosc_brutto,
    postedAt: raw.data_wystawienia ? new Date(raw.data_wystawienia) : undefined,
    dueAt: raw.termin_platnosci ? new Date(raw.termin_platnosci) : undefined,
    lineItems: (raw.pozycje ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.opis || undefined,
      unitAmount: l.cena_netto,
      unitQuantity: l.ilosc,
      totalAmount: l.wartosc_netto,
      taxAmount: l.wartosc_vat,
      accountId: l.konto_id ? String(l.konto_id) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
