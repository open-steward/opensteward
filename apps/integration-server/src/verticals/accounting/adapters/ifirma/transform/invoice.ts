/**
 * iFirma invoice transforms.
 *
 * List:   GET  /iapi/faktury.json?dataOd=YYYY-MM-DD  (key: faktura)
 * Create: POST /iapi/fakturakraj.json                (key: faktura)
 *
 * Response envelope: { response: { Kod, Informacja, Wynik: [...] } }
 *
 * Payment status is derived from Brutto / Zaplacono since iFirma
 * does not return a single canonical status field in the list response.
 *
 * Money: iFirma returns PLN as decimal floats (e.g. 123.45 PLN).
 * Canonical Amount fields use integer minor units (grosz).
 * toMinorUnits() multiplies by 100 and rounds.
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'

// ── Raw types ─────────────────────────────────────────────────────────────────

export interface IfirmaPozycja {
  NazwaPelna: string
  Ilosc: number
  CenaJednostkowa: number
  StawkaVat: number | string   // e.g. 23, "ZW", "NP"
  TypStawkiVat: string
  Jednostka: string
  Rabat: number
  [key: string]: unknown
}

export interface IfirmaInvoice {
  FakturaId: number
  PelnyNumer: string
  KontrahentNazwa: string
  IdentyfikatorKontrahenta: string
  NIPKontrahenta: string
  DataWystawienia: string      // YYYY-MM-DD
  TerminPlatnosci: string      // YYYY-MM-DD
  Brutto: number               // gross total
  Waluta: string
  Zaplacono: number            // amount paid
  Rodzaj: string               // document kind
  CzyWyslano: boolean
  Pozycje?: IfirmaPozycja[]
  Uwagi?: string
  MiejsceWystawienia?: string
  DataSprzedazy?: string
  SposobZaplaty?: string
  NumerKontaBankowego?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: IfirmaInvoice): InvoiceStatus {
  const total = raw.Brutto ?? 0
  const paid = raw.Zaplacono ?? 0
  if (total > 0 && paid >= total) return 'PAID'
  if (paid > 0 && paid < total) return 'PARTIALLY_PAID'
  if (raw.TerminPlatnosci) {
    const due = new Date(raw.TerminPlatnosci)
    if (!isNaN(due.getTime()) && due < new Date()) return 'OVERDUE'
  }
  return 'AUTHORIZED'
}

function mapLineitem(p: IfirmaPozycja): Lineitem {
  const vatRate = typeof p.StawkaVat === 'number' ? p.StawkaVat : undefined
  const qty = p.Ilosc ?? 1
  const unitAmt = p.CenaJednostkowa ?? 0
  const totalDecimal = qty * unitAmt
  // taxAmt is computed from the decimal total so we can keep precision before
  // converting to integer minor units.
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

export function transformInvoice(raw: IfirmaInvoice): Invoice {
  const bruttoMinor = toMinorUnits(raw.Brutto) ?? 0
  const zaplaconoMinor = toMinorUnits(raw.Zaplacono)
  return {
    id: String(raw.FakturaId),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.PelnyNumer || undefined,
    contactId: raw.IdentyfikatorKontrahenta || undefined,
    currency: raw.Waluta || undefined,
    totalAmount: bruttoMinor,
    paidAmount: zaplaconoMinor || undefined,
    balanceAmount: Math.max(0, bruttoMinor - (zaplaconoMinor ?? 0)),
    notes: raw.Uwagi || undefined,
    postedAt: raw.DataWystawienia ? new Date(raw.DataWystawienia) : undefined,
    dueAt: raw.TerminPlatnosci ? new Date(raw.TerminPlatnosci) : undefined,
    lineItems: Array.isArray(raw.Pozycje) ? raw.Pozycje.map(mapLineitem) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → iFirma POST body) ────────────────────────────────

/** Convert integer minor units (grosz) to PLN decimal float for iFirma API. */
function toDecimal(minorUnits: number | null | undefined): number {
  if (minorUnits === null || minorUnits === undefined) return 0
  return minorUnits / 100
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  const lines = (invoice.lineItems ?? []).map((li) => ({
    NazwaPelna: li.itemDescription ?? li.itemName ?? '',
    Ilosc: li.unitQuantity ?? 1,
    CenaJednostkowa: toDecimal(li.unitAmount),
    StawkaVat: 23,
    TypStawkiVat: 'PRC',
    Jednostka: 'szt.',
    Rabat: toDecimal(li.discountAmount),
  }))
  return {
    Zaplacono: toDecimal(invoice.paidAmount),
    ZaplaconoNaDokumencie: toDecimal(invoice.paidAmount),
    LiczOd: 'BRT',
    DataWystawienia: toCalendarDate(invoice.postedAt),
    DataSprzedazy: toCalendarDate(invoice.postedAt),
    FormatDatySprzedazy: 'DZN',
    TerminPlatnosci: toCalendarDate(invoice.dueAt),
    SposobZaplaty: 'PRZ',
    RodzajPodpisuOdbiorcy: 'BPO',
    WidocznyNumerGios: false,
    WidocznyNumerBdo: false,
    Numer: null,
    Uwagi: invoice.notes,
    IdentyfikatorKontrahenta: invoice.contactId,
    Pozycje: lines,
  }
}
