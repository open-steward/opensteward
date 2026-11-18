/**
 * KLARA VAT rate (Mehrwertsteuersatz) transform.
 *
 * Switzerland uses 3 standard VAT rates (normal 8.1%, special 3.8%, reduced 2.6%)
 * plus 0% for exempt transactions.
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface KlaraTaxRate {
  id: string
  name?: string
  description?: string
  rate?: number              // percentage, e.g. 8.1
  is_active?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: KlaraTaxRate): TaxRate {
  return {
    id: raw.id || undefined,
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.is_active ?? true,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
