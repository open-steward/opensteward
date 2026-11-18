/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ComarchoptimaExpenseLine {
  id: string | number
  opis?: string
  cena?: number
  ilosc?: number
  wartosc_netto?: number
  wartosc_vat?: number
  konto_id?: string
  [key: string]: unknown
}

export interface ComarchoptimaExpense {
  id: string | number
  data?: string
  wartosc_brutto?: number
  wartosc_vat?: number
  waluta?: string
  kontrahent_id?: string | number
  konto_id?: string
  pozycje?: ComarchoptimaExpenseLine[]
  [key: string]: unknown
}

export function transformExpense(raw: ComarchoptimaExpense): Expense {
  return {
    id: String(raw.id),
    contactId: raw.kontrahent_id ? String(raw.kontrahent_id) : undefined,
    accountId: raw.konto_id ? String(raw.konto_id) : undefined,
    currency: raw.waluta || undefined,
    totalAmount: raw.wartosc_brutto,
    taxAmount: raw.wartosc_vat,
    postedAt: raw.data ? new Date(raw.data) : undefined,
    lineItems: (raw.pozycje ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.opis || undefined,
      unitAmount: l.cena,
      unitQuantity: l.ilosc,
      totalAmount: l.wartosc_netto,
      taxAmount: l.wartosc_vat,
      accountId: l.konto_id ? String(l.konto_id) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
