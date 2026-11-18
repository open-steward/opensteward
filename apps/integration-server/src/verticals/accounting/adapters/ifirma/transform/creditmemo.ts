/**
 * iFirma credit-memo (corrective invoice) transforms.
 *
 * iFirma calls these "faktury korygujące" (corrective invoices).
 *
 * Create: POST /iapi/fakturakraj/korekta/{originalInvoiceId}.json  (key: faktura)
 * Get:    GET  /iapi/fakturakraj/korekta/{id}.json                 (key: faktura)
 *
 * Response envelope:
 *   POST → { response: { Kod, Informacja, Identyfikator } }
 *   GET  → same IfirmaInvoice shape as regular invoices (Brutto, Waluta, …)
 *
 * There is no list endpoint for corrective invoices in the iFirma public API.
 * Only create and individual retrieval are supported.
 *
 * Money: iFirma returns PLN as decimal floats (e.g. -123.45 PLN for a credit).
 * Canonical Amount fields use integer minor units (grosz).
 * toMinorUnits() multiplies by 100 and rounds.
 */
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'
import type { IfirmaInvoice, IfirmaPozycja } from './invoice'

// ── Re-export the raw type so index.ts can reference it ──────────────────────

export type { IfirmaInvoice as IfirmaKorekta }

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: IfirmaInvoice): CreditMemoStatus {
  const total = Math.abs(raw.Brutto ?? 0)
  const paid = Math.abs(raw.Zaplacono ?? 0)
  if (total > 0 && paid >= total) return 'PAID'
  if (paid > 0 && paid < total) return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

function mapLineitem(p: IfirmaPozycja): Lineitem {
  const vatRate = typeof p.StawkaVat === 'number' ? p.StawkaVat : undefined
  const qty = p.Ilosc ?? 1
  const unitAmt = p.CenaJednostkowa ?? 0
  const totalDecimal = qty * unitAmt
  const taxAmtDecimal = vatRate !== undefined ? totalDecimal * vatRate / 100 : undefined
  return {
    itemDescription: p.NazwaPelna || undefined,
    unitAmount: toMinorUnits(unitAmt),
    unitQuantity: Math.round(qty),
    totalAmount: toMinorUnits(totalDecimal),
    taxAmount: taxAmtDecimal !== undefined ? toMinorUnits(taxAmtDecimal) : undefined,
    discountAmount: p.Rabat ? toMinorUnits(p.Rabat) : undefined,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCreditMemo(raw: IfirmaInvoice): CreditMemo {
  const bruttoMinor = toMinorUnits(Math.abs(raw.Brutto ?? 0)) ?? 0
  const zaplaconoMinor = toMinorUnits(Math.abs(raw.Zaplacono ?? 0))
  const balance = Math.max(0, bruttoMinor - (zaplaconoMinor ?? 0))
  return {
    id: String(raw.FakturaId),
    status: mapStatus(raw),
    creditmemoNumber: raw.PelnyNumer || undefined,
    contactId: raw.IdentyfikatorKontrahenta || undefined,
    currency: raw.Waluta || undefined,
    totalAmount: bruttoMinor,
    paidAmount: zaplaconoMinor || undefined,
    balanceAmount: balance || undefined,
    notes: raw.Uwagi || undefined,
    postedAt: raw.DataWystawienia ? new Date(raw.DataWystawienia) : undefined,
    dueAt: raw.TerminPlatnosci ? new Date(raw.TerminPlatnosci) : undefined,
    lineItems: Array.isArray(raw.Pozycje) ? raw.Pozycje.map(mapLineitem) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → iFirma POST body for korekta) ───────────────────

function toDecimal(minorUnits: number | null | undefined): number {
  if (minorUnits === null || minorUnits === undefined) return 0
  return minorUnits / 100
}

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  const lines = (cm.lineItems ?? []).map((li) => ({
    NazwaPelna: li.itemDescription ?? li.itemName ?? '',
    Ilosc: li.unitQuantity ?? 1,
    CenaJednostkowa: toDecimal(li.unitAmount),
    StawkaVat: 23,
    TypStawkiVat: 'PRC',
    Jednostka: 'szt.',
    Rabat: toDecimal(li.discountAmount),
  }))
  return {
    PowodKorekty: 'ZWR_SPRZ_TOW',
    DataWystawienia: toCalendarDate(cm.postedAt),
    SpelnionoWarunki: true,
    SposobZaplaty: 'PRZ',
    RodzajPodpisuOdbiorcy: 'BPO',
    Zaplacono: toDecimal(cm.paidAmount),
    Uwagi: cm.notes,
    Pozycje: lines,
  }
}
