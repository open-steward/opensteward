/**
 * Invoiced TaxRate transform.
 *
 * Docs: https://developer.invoiced.com/api/tax-rates
 */
import type { TaxRate } from '../../../schema/taxrate'

export interface InvoicedTaxRate {
  id: number
  object: string
  name: string
  value: number
  is_percent: boolean
  inclusive: boolean
  currency: string | null
  metadata: Record<string, unknown>
  created_at: number
  updated_at: number
  [key: string]: unknown
}

export function transformTaxRate(raw: InvoicedTaxRate): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.name || undefined,
    // value is already a percentage when is_percent=true; otherwise it's a flat amount
    rate: raw.is_percent ? raw.value : undefined,
    isActive: true,
    createdAt: raw.created_at ? new Date(raw.created_at * 1000) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at * 1000) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
