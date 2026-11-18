import { describe, it, expect } from 'vitest'
import {
  flattenProducts,
  type RawShipBobProduct,
  type RawShipBobVariant,
} from '../../../../../../../src/verticals/inventory/adapters/shipbob-inventory/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

/**
 * ShipBob has THREE id spaces for one sellable thing, and this file used to
 * pick the wrong one:
 *
 *   product    10343431   a container; carries no SKU and no stock
 *   variant    23403772   the SKU lives here
 *   inventory  16160699   the stock-of-record; what /inventory-level and a
 *                         receiving order's inventory_quantities[] reference
 *
 * `product.id` was the PRODUCT id, while every stock level and purchase-order
 * line points at the INVENTORY id — so on a real sync 0 of 84 stock levels and
 * 0 of 76 PO lines resolved to a product. Every row was schema-valid; the break
 * only shows across resources (see references.test.ts).
 *
 * A canonical product is now one per VARIANT, keyed by its inventory id. That
 * is the only key the rest of the adapter can reference, and it stops variants
 * two-onward being silently dropped — the old transform read `variants[0]` and
 * nothing else.
 *
 * `live()` below is a real sandbox payload (GET /2026-01/product, 2026-09-22),
 * trimmed to the fields the transform reads. `twoVariants()` is CONSTRUCTED:
 * every product in that sandbox has exactly one variant, which is the seed gap
 * that let the single-variant assumption go untested.
 */
function variant(over: Partial<RawShipBobVariant> = {}): RawShipBobVariant {
  return {
    id: 23403772,
    name: 'Cold Brew Concentrate 6-Pack',
    sku: 'DEMO-COFFEE-COLD-6PK',
    status: 'Active',
    gtin: '',
    upc: '',
    barcodes: [],
    is_digital: false,
    dimension: { length: 12, width: 8, height: 7, unit: 'inch', is_locked: false },
    weight: { weight: 96, unit: 'oz' },
    inventory: { inventory_id: 16160699, on_hand_qty: 70 },
    created_on: '2026-09-12T06:35:52.381Z',
    updated_on: '2026-09-13T06:33:20.249Z',
    ...over,
  }
}

function live(over: Partial<RawShipBobProduct> = {}): RawShipBobProduct {
  return {
    id: 10343431,
    name: 'Cold Brew Concentrate 6-Pack',
    type: 'Regular',
    user_id: 546813,
    created_on: '2026-09-12T06:35:52.483Z',
    updated_on: '2026-09-13T06:33:20.249Z',
    taxonomy: null,
    variants: [variant()],
    ...over,
  }
}

function twoVariants(): RawShipBobProduct {
  return live({
    id: 500,
    name: 'Classic Tee',
    taxonomy: { id: 12, name: 'Apparel' },
    variants: [
      variant({
        id: 9001,
        name: 'Classic Tee - White / Small',
        sku: 'TEE-WHT-S',
        inventory: { inventory_id: 7001, on_hand_qty: 10 },
      }),
      variant({
        id: 9002,
        name: 'Classic Tee - White / Medium',
        sku: 'TEE-WHT-M',
        inventory: { inventory_id: 7002, on_hand_qty: 4 },
      }),
    ],
  })
}

/** Exactly one row, for the tests about a single variant's fields. */
function only(raw: RawShipBobProduct) {
  const rows = flattenProducts(raw)
  expect(rows).toHaveLength(1)
  return rows[0]!
}

describe('shipbob-inventory flattenProducts — one canonical product per variant', () => {
  it('emits one product per variant, not one per ShipBob product', () => {
    expect(flattenProducts(twoVariants()).map((p) => p.sku)).toEqual(['TEE-WHT-S', 'TEE-WHT-M'])
  })

  it('keys each product by its inventory id, the id stock levels and PO lines reference', () => {
    const p = only(live())
    expect(p.id).toBe('16160699')
    expect(p.externalId).toBe('16160699')
  })

  it('is keyed by neither the ShipBob product id nor the variant id', () => {
    // The two ids that look right and are not: the product id is what this
    // file emitted before, and the variant id is what a "one per variant"
    // rewrite would reach for first.
    const p = only(live())
    expect(p.id).not.toBe('10343431')
    expect(p.id).not.toBe('23403772')
  })

  it('skips a variant with no inventory id, since nothing could ever reference it', () => {
    const raw = live({ variants: [variant({ inventory: null }), variant({ sku: 'KEPT' })] })
    expect(flattenProducts(raw).map((p) => p.sku)).toEqual(['KEPT'])
  })

  it('yields nothing for a product with no variants', () => {
    expect(flattenProducts(live({ variants: [] }))).toEqual([])
    expect(flattenProducts(live({ variants: null }))).toEqual([])
  })

  it('names each row after its variant, falling back to the product', () => {
    expect(flattenProducts(twoVariants()).map((p) => p.name)).toEqual([
      'Classic Tee - White / Small',
      'Classic Tee - White / Medium',
    ])
    expect(only(live({ variants: [variant({ name: null })] })).name).toBe('Cold Brew Concentrate 6-Pack')
  })

  it('carries the product-level taxonomy onto every variant row', () => {
    expect(flattenProducts(twoVariants()).map((p) => p.category)).toEqual(['Apparel', 'Apparel'])
  })

  it('leaves parentProductId unset, because no parent row is emitted to point at', () => {
    // The canonical field names a parent PRODUCT RECORD ("Master products have
    // parentProductId: undefined"). The ShipBob product container is not
    // emitted as one, so its id here would be a reference that resolves to
    // nothing — the defect this rewrite exists to remove.
    for (const p of flattenProducts(twoVariants())) expect(p.parentProductId).toBeUndefined()
  })

  it('keeps the ShipBob product and variant ids in metadata', () => {
    // So the grouping survives without claiming a canonical parent — and
    // outside `raw`, which strip-raw-payload can remove.
    expect(flattenProducts(twoVariants()).map((p) => p.metadata)).toEqual([
      { shipbobProductId: '500', shipbobVariantId: '9001' },
      { shipbobProductId: '500', shipbobVariantId: '9002' },
    ])
  })

  it('keeps the product in raw with only this row’s own variant', () => {
    const [first, second] = flattenProducts(twoVariants())
    const r1 = first!.raw as RawShipBobProduct
    const r2 = second!.raw as RawShipBobProduct
    expect(r1.id).toBe(500)
    expect(r1.variants?.map((v) => v.id)).toEqual([9001])
    expect(r2.variants?.map((v) => v.id)).toEqual([9002])
  })

  it('dates each row from its variant, falling back to the product', () => {
    expect(only(live()).createdAt).toBe('2026-09-12T06:35:52.381Z')
    const bare = live({ variants: [variant({ created_on: null, updated_on: null })] })
    expect(only(bare).createdAt).toBe('2026-09-12T06:35:52.483Z')
    expect(only(bare).updatedAt).toBe('2026-09-13T06:33:20.249Z')
  })

  it('declares no suppliers, because ShipBob models none', () => {
    expect(only(live()).supplierIds).toEqual([])
  })

  it('produces rows that satisfy the canonical schema', () => {
    for (const p of [...flattenProducts(live()), ...flattenProducts(twoVariants())]) {
      expect(() => ProductSchema.parse(p)).not.toThrow()
    }
  })
})

describe('shipbob-inventory products — per-variant fields the live API actually returns', () => {
  it('reads isActive from the variant status', () => {
    // The 2026-01 document lists no active flag, so this once hardcoded
    // `true`. The live payload carries `status` on every variant.
    expect(only(live()).isActive).toBe(true)
    expect(only(live({ variants: [variant({ status: 'Inactive' })] })).isActive).toBe(false)
  })

  it('reads isActive per variant, so one archived variant does not archive its siblings', () => {
    const raw = twoVariants()
    raw.variants![1] = { ...raw.variants![1]!, status: 'Inactive' }
    expect(flattenProducts(raw).map((p) => p.isActive)).toEqual([true, false])
  })

  it('treats an empty upc and gtin as absent rather than as an empty barcode', () => {
    // ShipBob sends "" for both when unset; "" reads downstream as "has a UPC".
    expect(only(live()).upc).toBeUndefined()
  })

  it('prefers a real upc, then falls back to a real gtin', () => {
    expect(only(live({ variants: [variant({ upc: '012345678905' })] })).upc).toBe('012345678905')
    expect(only(live({ variants: [variant({ upc: '', gtin: '5901234123457' })] })).upc).toBe('5901234123457')
  })

  it('converts the variant weight from ounces to grams', () => {
    // 96 oz; carrying the number across without its unit understates it 28x.
    expect(only(live()).weightGrams).toBe(2722)
  })

  it('converts the variant dimensions from inches to centimetres', () => {
    expect(only(live()).dimensionsCm).toEqual({ length: 30.48, width: 20.32, height: 17.78 })
  })

  it('does not invent a weight or dimensions when the variant has none', () => {
    const bare = only(live({ variants: [variant({ weight: null, dimension: null })] }))
    expect(bare.weightGrams).toBeUndefined()
    expect(bare.dimensionsCm).toBeUndefined()
  })

  it('accepts metric units without converting them a second time', () => {
    const metric = only(
      live({
        variants: [
          variant({
            weight: { weight: 500, unit: 'g' },
            dimension: { length: 10, width: 5, height: 2, unit: 'cm' },
          }),
        ],
      }),
    )
    expect(metric.weightGrams).toBe(500)
    expect(metric.dimensionsCm).toEqual({ length: 10, width: 5, height: 2 })
  })
})
