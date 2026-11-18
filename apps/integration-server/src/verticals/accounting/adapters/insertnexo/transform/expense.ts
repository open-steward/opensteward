/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface InsertnexoExpenseLine {
  Id: string | number
  Opis?: string
  Cena?: number
  Ilosc?: number
  WartoscNetto?: number
  WartoscVat?: number
  KontoId?: string
  [key: string]: unknown
}

export interface InsertnexoExpense {
  Id: string | number
  Data?: string
  Brutto?: number
  Vat?: number
  Waluta?: string
  KontrahentId?: string | number
  KontoId?: string
  Pozycje?: InsertnexoExpenseLine[]
  [key: string]: unknown
}

export function transformExpense(raw: InsertnexoExpense): Expense {
  return {
    id: String(raw.Id),
    contactId: raw.KontrahentId ? String(raw.KontrahentId) : undefined,
    accountId: raw.KontoId ? String(raw.KontoId) : undefined,
    currency: raw.Waluta || undefined,
    totalAmount: raw.Brutto,
    taxAmount: raw.Vat,
    postedAt: raw.Data ? new Date(raw.Data) : undefined,
    lineItems: (raw.Pozycje ?? []).map(l => ({
      id: String(l.Id),
      itemDescription: l.Opis || undefined,
      unitAmount: l.Cena,
      unitQuantity: l.Ilosc,
      totalAmount: l.WartoscNetto,
      taxAmount: l.WartoscVat,
      accountId: l.KontoId ? String(l.KontoId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
