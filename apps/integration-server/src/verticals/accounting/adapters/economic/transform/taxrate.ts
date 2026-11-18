import type { TaxRate } from '../../../schema/taxrate'

export interface EconomicVatZone {
  vatZoneNumber: number
  name: string
  enabledForCustomer: boolean
  enabledForSupplier: boolean
  [key: string]: unknown
}

export interface EconomicVatAccount {
  vatCode: string
  name: string
  ratePercentage: number
  [key: string]: unknown
}

export function transformTaxRate(raw: EconomicVatAccount): TaxRate {
  return {
    id: raw.vatCode,
    name: raw.name || undefined,
    rate: raw.ratePercentage,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
