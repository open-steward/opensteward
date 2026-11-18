/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface InsertnexoCreditMemoLine {
  Id: string | number
  Opis?: string
  CenaNetto?: number
  Ilosc?: number
  WartoscNetto?: number
  WartoscVat?: number
  KontoId?: string
  [key: string]: unknown
}

export interface InsertnexoCreditMemo {
  Id: string | number
  Numer?: string
  DataWystawienia?: string
  TerminPlatnosci?: string
  Brutto?: number
  Vat?: number
  Status?: string
  KontrahentId?: string | number
  Waluta?: string
  Pozycje?: InsertnexoCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): CreditMemoStatus {
  switch (s?.toLowerCase()) {
    case 'oplacona': return 'PAID'
    case 'wystawiona': return 'AUTHORIZED'
    case 'anulowana': return 'VOIDED'
    case 'czesciowo_oplacona': return 'PARTIALLY_PAID'
    default: return 'DRAFT'
  }
}

export function transformCreditMemo(raw: InsertnexoCreditMemo): CreditMemo {
  return {
    id: String(raw.Id),
    status: mapStatus(raw.Status),
    creditmemoNumber: raw.Numer || undefined,
    contactId: raw.KontrahentId ? String(raw.KontrahentId) : undefined,
    currency: raw.Waluta || undefined,
    totalAmount: raw.Brutto,
    taxAmount: raw.Vat,
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
