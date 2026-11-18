import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

// ── PPL CZ raw codelist/product types ────────────────────────────────────────

/**
 * A single product entry returned by GET /codelist/product.
 * Each entry represents one PPL CZ shipping service type.
 */
export interface PplCzProduct {
  /** Short service code (e.g. "BUSS", "CONN", "PRIV") */
  code?: string | null
  /** Human-readable service name */
  name?: string | null
  [key: string]: unknown
}

// ── Carrier transform ─────────────────────────────────────────────────────────

/**
 * Transform a list of PPL CZ product codelist entries into a canonical Carrier.
 *
 * PPL CZ is a single carrier. The /codelist/product endpoint returns all
 * available shipping service codes (products). We build one Carrier record
 * representing PPL CZ itself, with `services` populated from the codelist.
 */
export function transformCarrierFromProducts(products: PplCzProduct[]): Carrier {
  const services: CarrierService[] = products
    .filter((p) => p.code)
    .map((p) => ({
      code: p.code as string,
      name: p.name ?? undefined,
    }))

  return {
    id: 'ppl-cz',
    name: 'PPL CZ',
    code: 'ppl-cz',
    trackingUrlTemplate:
      'https://www.ppl.cz/en/track-a-shipment?code={trackingNumber}',
    services: services.length > 0 ? services : undefined,
    isActive: true,
    metadata: { products } as Record<string, unknown>,
  }
}
