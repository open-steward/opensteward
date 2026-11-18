/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Bill, BillStatus } from '../../../schema/bill'

export interface DaneaFatturaAcquisto {
  id: string
  Numero: string
  Data: string
  Scadenza: string
  TotaleNetto: number
  TotaleIva: number
  TotaleLordo: number
  TotaleResiduo: number
  Stato: string
  Valuta: string
  FornitoreId: string
  [key: string]: unknown
}

function mapStatus(stato: string): BillStatus {
  switch (stato) {
    case 'Emessa': return 'AUTHORIZED'
    case 'Pagata': return 'PAID'
    case 'Annullata': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: DaneaFatturaAcquisto): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Stato),
    billNumber: raw.Numero || undefined,
    contactId: raw.FornitoreId || undefined,
    currency: raw.Valuta || undefined,
    totalAmount: raw.TotaleLordo,
    taxAmount: raw.TotaleIva,
    balanceAmount: raw.TotaleResiduo,
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    dueAt: raw.Scadenza ? new Date(raw.Scadenza) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
