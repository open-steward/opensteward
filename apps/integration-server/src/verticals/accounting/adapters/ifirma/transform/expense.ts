/**
 * iFirma expense transforms.
 *
 * iFirma exposes expense documents via several endpoints, the most general
 * being kosztdzialalnoscivat.json (business expense with VAT) and
 * zakuptowaruvat.json (goods/materials purchase with VAT).
 *
 * Create: POST /iapi/kosztdzialalnoscivat.json  (key: wydatek)
 *
 * Response envelope: { response: { Kod, Informacja } }
 * (no list endpoint for expenses in the public API; only create is available)
 *
 * Money: iFirma uses PLN decimal floats (e.g. 123.45 PLN).
 * Canonical Amount fields use integer minor units (grosz).
 * toMinorUnits() multiplies by 100 and rounds.
 */
import type { Expense } from '../../../schema/expense'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'

// ── Raw type ──────────────────────────────────────────────────────────────────

export interface IfirmaWydatek {
  /** Identifier returned after creation — may be absent on list */
  Identyfikator?: string | number
  NumerFaktury: string
  NazwaWydatku: string
  DataWystawienia: string        // YYYY-MM-DD
  TerminPlatnosci?: string       // YYYY-MM-DD
  KwotaNetto23?: number
  KwotaVat23?: number
  KwotaNetto08?: number
  KwotaVat08?: number
  KwotaNetto05?: number
  KwotaVat05?: number
  KwotaNetto00?: number
  Kwota?: number                 // for non-VAT docs
  Kontrahent?: {
    Nazwa: string
    NIP?: string
    Ulica?: string
    KodPocztowy: string
    Miejscowosc: string
  }
  IdentyfikatorKontrahenta?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function totalNetto(raw: IfirmaWydatek): number {
  return (
    (raw.KwotaNetto23 ?? 0) +
    (raw.KwotaNetto08 ?? 0) +
    (raw.KwotaNetto05 ?? 0) +
    (raw.KwotaNetto00 ?? 0) +
    (raw.Kwota ?? 0)
  )
}

function totalVat(raw: IfirmaWydatek): number {
  return (
    (raw.KwotaVat23 ?? 0) +
    (raw.KwotaVat08 ?? 0) +
    (raw.KwotaVat05 ?? 0)
  )
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformExpense(raw: IfirmaWydatek): Expense {
  const nettoDecimal = totalNetto(raw)
  const vatDecimal = totalVat(raw)
  const totalDecimal = nettoDecimal + vatDecimal
  return {
    id: raw.Identyfikator !== undefined ? String(raw.Identyfikator) : raw.NumerFaktury,
    name: raw.NazwaWydatku || undefined,
    contactId: raw.IdentyfikatorKontrahenta || undefined,
    totalAmount: toMinorUnits(totalDecimal),
    taxAmount: vatDecimal ? toMinorUnits(vatDecimal) : undefined,
    postedAt: raw.DataWystawienia ? new Date(raw.DataWystawienia) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → iFirma POST body for kosztdzialalnoscivat) ───────

/** Convert integer minor units (grosz) to PLN decimal float for iFirma API. */
function toDecimal(minorUnits: number | null | undefined): number {
  if (minorUnits === null || minorUnits === undefined) return 0
  return minorUnits / 100
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  // Canonical amounts are integer minor units (grosz); iFirma expects PLN decimals.
  const totalDecimal = toDecimal(expense.totalAmount)
  const vatDecimal = toDecimal(expense.taxAmount)
  const nettoDecimal = totalDecimal - vatDecimal
  return {
    NumerFaktury: expense.id ?? '',
    NazwaWydatku: expense.name ?? '',
    DataWystawienia: toCalendarDate(expense.postedAt),
    KwotaNetto23: nettoDecimal,
    KwotaVat23: vatDecimal,
    RodzajSprzedazy: 'OP',
    IdentyfikatorKontrahenta: expense.contactId,
  }
}
