/**
 * Reckon One v2 tax code transforms.
 *
 * API endpoint: GET /R1/{cashbookId}/taxCodes[/{taxCodeId}]
 *
 * Key fields: id, name, description, rate, isActive
 */

import type { TaxRate } from '../../../schema/taxrate'

export interface ReckonOneTaxCode {
  id: string
  name?: string
  description?: string
  /** Rate expressed as a percentage, e.g. 10 = 10% GST */
  rate?: number
  isActive?: boolean
  createdDateTime?: string
  modifiedDateTime?: string
  [key: string]: unknown
}

export function transformTaxRate(raw: ReckonOneTaxCode): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    rate: raw.rate,
    isActive: raw.isActive ?? true,
    createdAt: raw.createdDateTime ? new Date(raw.createdDateTime) : undefined,
    updatedAt: raw.modifiedDateTime ? new Date(raw.modifiedDateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
