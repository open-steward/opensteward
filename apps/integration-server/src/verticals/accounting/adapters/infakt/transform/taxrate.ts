import type { TaxRate } from '../../../schema/taxrate'

/**
 * inFakt VAT rate.
 *
 * inFakt does not expose a dedicated /tax_rates endpoint. VAT rates
 * (tax_symbol) are fixed Polish VAT rates embedded in products and invoice
 * services. This transform models a synthetic VAT rate record derived from
 * the known inFakt tax symbols.
 *
 * Known symbols: "23", "8", "5", "0", "zw" (exempt), "np" (outside scope)
 */

export interface InfaktVatRate {
  symbol: string
  rate: number | null
  label: string
  [key: string]: unknown
}

export function transformTaxRate(raw: InfaktVatRate): TaxRate {
  return {
    id: raw.symbol,
    name: raw.label || raw.symbol,
    description: raw.label || undefined,
    rate: raw.rate ?? undefined,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Returns a synthetic list of Polish VAT rates as used by inFakt.
 * Call this when there is no live /tax_rates endpoint to query.
 */
export function getBuiltinTaxRates(): TaxRate[] {
  const rates: InfaktVatRate[] = [
    { symbol: '23', rate: 23, label: 'VAT 23%' },
    { symbol: '8', rate: 8, label: 'VAT 8%' },
    { symbol: '5', rate: 5, label: 'VAT 5%' },
    { symbol: '0', rate: 0, label: 'VAT 0%' },
    { symbol: 'zw', rate: 0, label: 'VAT zwolniony (exempt)' },
    { symbol: 'np', rate: null, label: 'VAT nie podlega (outside scope)' },
  ]
  return rates.map(transformTaxRate)
}
