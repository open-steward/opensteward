/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface DaneaRigaNotaCredito {
  Id: string
  Descrizione: string
  Quantita: number
  PrezzoUnitario: number
  Totale: number
  Iva: number
  Conto: string
  [key: string]: unknown
}

export interface DaneaNotaCredito {
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
  ClienteId: string
  Righe?: DaneaRigaNotaCredito[]
  [key: string]: unknown
}

function mapStatus(stato: string): CreditMemoStatus {
  switch (stato) {
    case 'Emessa': return 'AUTHORIZED'
    case 'Pagata': return 'PAID'
    case 'Annullata': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: DaneaRigaNotaCredito): Lineitem {
  return {
    id: String(row.Id),
    accountId: row.Conto || undefined,
    itemDescription: row.Descrizione || undefined,
    unitAmount: row.PrezzoUnitario,
    unitQuantity: row.Quantita,
    totalAmount: row.Totale,
    taxAmount: row.Iva,
  }
}

export function transformCreditMemo(raw: DaneaNotaCredito): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw.Stato),
    creditmemoNumber: raw.Numero || undefined,
    contactId: raw.ClienteId || undefined,
    currency: raw.Valuta || undefined,
    totalAmount: raw.TotaleLordo,
    taxAmount: raw.TotaleIva,
    balanceAmount: raw.TotaleResiduo,
    lineItems: (raw.Righe ?? []).map(mapLineitem),
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    dueAt: raw.Scadenza ? new Date(raw.Scadenza) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
