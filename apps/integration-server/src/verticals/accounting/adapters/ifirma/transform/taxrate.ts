/**
 * iFirma tax-rate transforms.
 *
 * Endpoint: GET /iapi/slownik/stawki_vat/{countryCode}.json  (key: faktura)
 *
 * Returns VAT rates for a given country (ISO 3166-1 alpha-2).
 * The Polish domestic rates are available via country code "PL".
 *
 * Response, as documented at https://api.ifirma.pl/stawki-vat-w-krajach-unii-europejskiej/:
 *   { response: { KodKraju, NazwaKraju, StawkiVat: [...] } }
 * The adapter also accepts the same object inside a Kod / Informacja / Wynik
 * wrapper, the envelope the invoice and contractor endpoints use.
 *
 * Each StawkiVat entry is a rate-type / rate-value pair:
 *   Rodzaj  – e.g. "POD" (standard), "PR1" (reduced 1), "PR2" (reduced 2), "ZW" (exempt)
 *   Wartosc – percentage as a number (e.g. 23 for 23%)
 *
 * IDs are synthesised as "{countryCode}_{Rodzaj}" since iFirma does not
 * return unique identifiers for VAT rate entries.
 */
import type { TaxRate } from '../../../schema/taxrate'

// ── Raw types ─────────────────────────────────────────────────────────────────

export interface IfirmaStawkaVat {
  Rodzaj: string    // rate type: POD, PR1, PR2, PR3, ZW, NP, …
  Wartosc: number   // percentage value, e.g. 23
  [key: string]: unknown
}

export interface IfirmaStawkiVatWynik {
  KodKraju: string         // ISO 3166-1 alpha-2 country code
  NazwaKraju: string       // country name in Polish
  StawkiVat: IfirmaStawkaVat[]
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

const FRIENDLY_TYPE: Record<string, string> = {
  POD: 'Standard',
  PR1: 'Reduced (1)',
  PR2: 'Reduced (2)',
  PR3: 'Reduced (3)',
  ZW: 'Exempt',
  NP: 'Not subject to VAT',
}

export function transformTaxRate(raw: IfirmaStawkaVat, countryCode: string): TaxRate {
  const rodzaj = raw.Rodzaj ?? 'UNK'
  const label = FRIENDLY_TYPE[rodzaj] ?? rodzaj
  const isExempt = rodzaj === 'ZW' || rodzaj === 'NP'
  return {
    id: `${countryCode.toUpperCase()}_${rodzaj}`,
    name: `${countryCode.toUpperCase()} ${label}`,
    description: `${countryCode.toUpperCase()} VAT rate — ${label}`,
    rate: isExempt ? 0 : raw.Wartosc,
    isActive: true,
    metadata: { ...raw, KodKraju: countryCode } as Record<string, unknown>,
  }
}
