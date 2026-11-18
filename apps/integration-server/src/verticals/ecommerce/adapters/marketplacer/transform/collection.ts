/**
 * Marketplacer Taxon → canonical Collection transform. Read-only: the Seller
 * API's "Reference Docs" mutation set (`advertUpsert`, `refundRequestCreate`,
 * `shipmentCreate`) has no taxon mutation — the categorization hierarchy is
 * operator-managed.
 *
 * Docs: https://api.marketplacer.com/docs/seller-api/reference/queries/taxons/
 */
import type { Collection } from '../../../schema/collection'

export interface RawMarketplacerTaxon {
  id: string
  displayName?: string
  treeName?: string
  [key: string]: unknown
}

export function transformCollection(raw: RawMarketplacerTaxon): Collection {
  return {
    id: String(raw.id),
    title: raw.displayName ?? raw.treeName ?? String(raw.id),
    description: raw.treeName ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
