import type { TaxRate } from '../../../schema/taxrate'

// ── Moss TaxRate ──────────────────────────────────────────────────────────────

export interface MossTaxRate {
  id: string
  organisationId: string
  type: string            // e.g. "VAT"
  country: string         // ISO 3166-1 alpha-2
  name: string
  rate: number            // percentage, e.g. 19 for 19%
  code: string
  status: string
  createTime: string
  updateTime: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformTaxRate(raw: MossTaxRate): TaxRate {
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.code ? `${raw.type} ${raw.code}` : undefined,
    rate: raw.rate,
    isActive: raw.status === 'ACTIVE',
    createdAt: raw.createTime ? new Date(raw.createTime) : undefined,
    updatedAt: raw.updateTime ? new Date(raw.updateTime) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
