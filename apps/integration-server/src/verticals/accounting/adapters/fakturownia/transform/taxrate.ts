/**
 * Fakturownia ↔ canonical TaxRate transform.
 *
 * Fakturownia exposes tax rates through the /categories.json endpoint
 * filtered by kind=income_tax (or expense_tax).  Each category record
 * carries a name and a percentage, making it a reasonable source for
 * canonical TaxRate objects.
 *
 * Key fields:
 *   id, name, description, use_with_documents (boolean)
 *
 * Docs: https://github.com/fakturownia/api
 */
import type { TaxRate } from '../../../schema/taxrate'

// ── Raw Fakturownia type ──────────────────────────────────────────────────────

export interface FakturowniaCategory {
  id: number | string
  name?: string
  description?: string
  use_with_documents?: boolean
  [key: string]: unknown
}

// ── Forward transform ─────────────────────────────────────────────────────────

export function transformTaxRate(raw: FakturowniaCategory): TaxRate {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    isActive: raw.use_with_documents !== false,
    metadata: raw as Record<string, unknown>,
  }
}
