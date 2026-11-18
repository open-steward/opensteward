import type { Product } from '../../../schema/product'

/**
 * `GET /2026-01/product`.
 *
 * The field list below is what a LIVE ShipBob sandbox response actually
 * contains (captured 2026-09-18), which is a superset of what the OpenAPI
 * document at https://marketplaceapi.shipbob.com/docs/2026-01.json describes:
 *
 *   items[]:           id, name, type, taxonomy, user_id, created_on,
 *                      updated_on, variants[]
 *   items[].variants[]: id, name, sku, status, upc, gtin, barcodes[],
 *                      is_digital, weight{weight,unit},
 *                      dimension{length,width,height,unit},
 *                      inventory{inventory_id,on_hand_qty}, channel_metadata[]
 *
 * Three of those — `status`, `weight` and `dimension` — are absent from the
 * document and were therefore missed when this file was first written against
 * it. They map onto canonical fields (`isActive`, `weightGrams`,
 * `dimensionsCm`), so dropping them was silent data loss.
 *
 * A ShipBob "product" is a container; the SKU and the stock live on its
 * variants, so a canonical product is one per variant — see `flattenProducts`.
 * An earlier version of this file mapped Cin7 Core's productList shape and
 * never matched a ShipBob payload at all.
 */
export interface RawShipBobVariant {
  id?: number
  name?: string | null
  sku?: string | null
  /** 'Active' | 'Inactive' — live only; not in the 2026-01 document. */
  status?: string | null
  barcodes?: string[] | null
  gtin?: string | null
  upc?: string | null
  is_digital?: boolean | null
  weight?: { weight?: number | null; unit?: string | null } | null
  dimension?: {
    length?: number | null
    width?: number | null
    height?: number | null
    unit?: string | null
    /** Present in live responses; not mapped. */
    is_locked?: boolean | null
  } | null
  /** NESTED — `inventory.inventory_id`, never a flat `inventory_id` on the
   *  variant. A fixture with the flat shape compiled (the index signature
   *  below admits anything) and hid the id-space defect. */
  inventory?: { inventory_id?: number; on_hand_qty?: number } | null
  created_on?: string | null
  updated_on?: string | null
  [key: string]: unknown
}

export interface RawShipBobProduct {
  id?: number
  name?: string | null
  type?: string | null
  taxonomy?: { id?: number; name?: string | null } | null
  variants?: RawShipBobVariant[] | null
  created_on?: string | null
  updated_on?: string | null
  user_id?: number
  [key: string]: unknown
}

/** Canonical datetimes in this vertical are ISO strings, not Date objects. */
function toIso(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

/**
 * ShipBob sends `""` rather than null for an unset barcode. Passing that
 * through publishes a product whose UPC is the empty string, which downstream
 * reads as "has a UPC" — so empty is treated as absent.
 */
function present(v: string | null | undefined): string | undefined {
  const t = v?.trim()
  return t ? t : undefined
}

const GRAMS_PER: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
}

const CM_PER: Record<string, number> = {
  cm: 1,
  centimeter: 1,
  centimetre: 1,
  mm: 0.1,
  m: 100,
  in: 2.54,
  inch: 2.54,
  inches: 2.54,
  ft: 30.48,
}

/**
 * A canonical weight is grams and a canonical dimension is centimetres, but
 * ShipBob reports whatever unit the merchant entered — `oz` and `inch` in every
 * live payload seen so far. Carrying the number across without its unit
 * understates a weight in ounces by a factor of 28.
 *
 * An unrecognised unit yields `undefined` rather than the raw number: a wrong
 * magnitude in a field whose unit is fixed by the schema is worse than an
 * absent one, because nothing downstream can tell it is wrong.
 */
function toGrams(w: RawShipBobVariant['weight']): number | undefined {
  const n = w?.weight
  if (n == null) return undefined
  const factor = GRAMS_PER[(w?.unit ?? 'g').toLowerCase()]
  if (factor == null) return undefined
  return Math.round(n * factor)
}

function toCm(n: number | null | undefined, factor: number): number | undefined {
  if (n == null) return undefined
  // Two decimals: 12 inch is exactly 30.48 cm, and floating point would
  // otherwise surface as 30.480000000000004.
  return Math.round(n * factor * 100) / 100
}

function toDimensionsCm(
  d: RawShipBobVariant['dimension'],
): Product['dimensionsCm'] | undefined {
  if (!d) return undefined
  const factor = CM_PER[(d.unit ?? 'cm').toLowerCase()]
  if (factor == null) return undefined
  const out = {
    length: toCm(d.length, factor),
    width: toCm(d.width, factor),
    height: toCm(d.height, factor),
  }
  return out.length == null && out.width == null && out.height == null ? undefined : out
}

/**
 * One canonical product per VARIANT, keyed by the variant's inventory id.
 *
 * ShipBob has three id spaces for one sellable thing — product (a container
 * with no SKU and no stock), variant (where the SKU lives) and inventory (the
 * stock-of-record). Stock levels and purchase-order lines reference the
 * INVENTORY id, so that is the only key under which a product can be joined
 * to anything this adapter emits. Keying on the product id — as this file did
 * until 2026-09-22 — left 0 of 84 stock levels and 0 of 76 PO lines resolving
 * on a real sync, with every row individually schema-valid.
 *
 * One row per variant is also what stops variants two-onward vanishing: the
 * product-keyed version read `variants[0]` and nothing else.
 *
 * A variant without an inventory id is skipped rather than emitted under a
 * blank or borrowed key — no stock level or PO line could reference it, and a
 * row nothing can reach is worse than no row.
 */
export function flattenProducts(raw: RawShipBobProduct): Product[] {
  return (raw.variants ?? [])
    .filter((v) => v.inventory?.inventory_id != null)
    .map((v) => transformVariant(raw, v))
}

function transformVariant(raw: RawShipBobProduct, variant: RawShipBobVariant): Product {
  const inventoryId = String(variant.inventory!.inventory_id)
  return {
    id: inventoryId,
    externalId: inventoryId,
    sku: variant.sku ?? '',
    // Variant names are the specific ones ("Classic Tee - White / Small");
    // the product name is the family.
    name: variant.name ?? raw.name ?? '',
    // Taxonomy is a product-level attribute, true of every variant.
    category: present(raw.taxonomy?.name),
    upc: present(variant.upc) ?? present(variant.gtin),
    weightGrams: toGrams(variant.weight),
    dimensionsCm: toDimensionsCm(variant.dimension),
    // From the variant's live `status` field. An absent status means active:
    // `/product` returns the live catalog, and defaulting to inactive would
    // hide the merchant's whole catalog behind an archived flag.
    isActive: variant.status ? variant.status.toLowerCase() === 'active' : true,
    // ShipBob is a 3PL: it warehouses stock, it does not model who the
    // merchant bought it from. There is no supplier entity to reference.
    supplierIds: [],
    // Deliberately unset. The canonical field names a parent PRODUCT RECORD
    // ("Master products have parentProductId: undefined"), and the ShipBob
    // product container is not emitted as one — its id here would be a
    // reference that resolves to nothing, the very defect this shape removes.
    // The grouping survives in `metadata` instead.
    parentProductId: undefined,
    createdAt: toIso(variant.created_on) ?? toIso(raw.created_on),
    updatedAt: toIso(variant.updated_on) ?? toIso(raw.updated_on),
    platform: 'shipbob-inventory',
    // Outside `raw`, which strip-raw-payload can remove, so the product/variant
    // grouping is not lost with it.
    metadata: {
      shipbobProductId: String(raw.id ?? ''),
      shipbobVariantId: String(variant.id ?? ''),
    },
    // The product as ShipBob sent it, but holding only this row's variant —
    // the whole product on every row would store each variant N times.
    raw: { ...raw, variants: [variant] } as unknown as Record<string, unknown>,
  }
}
