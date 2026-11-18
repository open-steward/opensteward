/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface InsertnexoInvoiceLine {
  Id: string | number
  Opis?: string
  CenaNetto?: number
  Ilosc?: number
  WartoscNetto?: number
  WartoscVat?: number
  KontoId?: string
  [key: string]: unknown
}

export interface InsertnexoInvoice {
  Id: string | number
  Numer?: string
  DataWystawienia?: string
  TerminPlatnosci?: string
  Brutto?: number
  Netto?: number
  Vat?: number
  Status?: string
  KontrahentId?: string | number
  Waluta?: string
  Pozycje?: InsertnexoInvoiceLine[]
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

export function transformInvoice(raw: InsertnexoInvoice): Invoice {
  return {
    id: String(raw.Id),
    type: 'INVOICE',
    status: mapStatus(raw.Status),
    invoiceNumber: raw.Numer || undefined,
    contactId: raw.KontrahentId ? String(raw.KontrahentId) : undefined,
    currency: raw.Waluta || undefined,
    totalAmount: raw.Brutto,
    taxAmount: raw.Vat,
    balanceAmount: raw.Brutto,
    postedAt: raw.DataWystawienia ? new Date(raw.DataWystawienia) : undefined,
    dueAt: raw.TerminPlatnosci ? new Date(raw.TerminPlatnosci) : undefined,
    lineItems: (raw.Pozycje ?? []).map(l => ({
      id: String(l.Id),
      itemDescription: l.Opis || undefined,
      unitAmount: l.CenaNetto,
      unitQuantity: l.Ilosc,
      totalAmount: l.WartoscNetto,
      taxAmount: l.WartoscVat,
      accountId: l.KontoId ? String(l.KontoId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
