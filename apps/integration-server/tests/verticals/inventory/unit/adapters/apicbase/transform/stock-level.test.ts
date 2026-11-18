/**
 * Rows as Apicbase documents them. The list endpoint
 * (GET /inventory/outlets/{outlet_id}/stock_items/stock/,
 * developers.apicbase.com/reference/get-inventory-stock-item-details) returns
 * id, name, package_description, par, minimum_quantity_required, quantity (a
 * number) and stock_value, where "The quantities and values returned represent
 * the total amounts for all stock items of that ingredient". The detail
 * endpoint (GET /inventory/outlets/{outlet_id}/stock_items/{stock_item_id}/stock/,
 * developers.apicbase.com/reference/get-detailed-stock-item-inventory-information)
 * returns its numbers as strings, plus storage_locations and the aggregated_*
 * pair, and there "`quantity` and `stock_value` are the amounts for the
 * queried stock item only": the ingredient-wide total is `aggregated_quantity`.
 * Neither returns `theoretical`, `actual` or `last_count_date`, which this
 * transform used to read, so every stock level came out with quantityOnHand 0.
 */
import { describe, it, expect } from 'vitest'
import {
  transformStockLevel,
  type RawApicbaseStockLevel,
} from '../../../../../../../src/verticals/inventory/adapters/apicbase/transform/stock-level'
import { StockLevelSchema } from '../../../../../../../src/verticals/inventory/schema/stock-level'

describe('apicbase transformStockLevel', () => {
  /** The documented list row "Cola Can (33 cl)", with the outlet the adapter injects. */
  const listed: RawApicbaseStockLevel = {
    id: '721794004480005',
    name: 'Cola Can (33 cl)',
    package_description: { unit: 'cl', quantity: '33.000000' },
    par: '15.00',
    minimum_quantity_required: '6.00',
    quantity: 18.0,
    stock_value: 0.0,
    outlet_uid: '829100725420008',
  }

  /** The documented detail response, with the ids getStockLevel injects. */
  const detail: RawApicbaseStockLevel = {
    id: '721794004480005',
    name: 'Cola Can (33 cl)',
    package_description: {
      unit: 'cl',
      base_unit: 'cl',
      quantity: '33.000000',
      unit_stock_item: null,
    },
    par: '10.00',
    minimum_quantity_required: '6.00',
    storage_locations: ['Fridge', 'Freezer', 'Dry Stock'],
    quantity: '12.00',
    stock_value: '18.20',
    aggregated_quantity: '18.00',
    aggregated_stock_value: '25.00',
    outlet_uid: '829100725420008',
    stock_item_uid: '721794004480005',
  }

  it('computes id as productId:locationId', () => {
    expect(transformStockLevel(listed).id).toBe('721794004480005:829100725420008')
  })

  it('maps productId from the id a documented stock row carries', () => {
    // Without it every row of an outlet shared the id ":{outletId}".
    const result = transformStockLevel({
      id: '421725380620004',
      name: 'Pasta Spaghetti 700 g',
      quantity: -0.45,
      stock_value: -0.27,
      outlet_uid: 'outlet-001',
    })
    expect(result.productId).toBe('421725380620004')
    expect(result.id).toBe('421725380620004:outlet-001')
    expect(result.quantityOnHand).toBe(-0.45)
  })

  it('prefers the stock item id getStockLevel injects', () => {
    expect(transformStockLevel({ ...detail, id: 'other' }).productId).toBe('721794004480005')
  })

  it('maps locationId from the injected outlet', () => {
    expect(transformStockLevel(listed).locationId).toBe('829100725420008')
  })

  it('maps quantityOnHand from the documented quantity, a number on list rows', () => {
    expect(transformStockLevel(listed).quantityOnHand).toBe(18)
  })

  it('maps quantityOnHand on the detail from aggregated_quantity, a string, not the item-only quantity', () => {
    // "The `aggregated_quantity` of Cola Can is **18** = 12 + (1 \* 6)."
    expect(transformStockLevel(detail).quantityOnHand).toBe(18)
  })

  it('reads the same quantityOnHand for one id from the list row and from the detail', () => {
    const fromList = transformStockLevel(listed)
    const fromDetail = transformStockLevel(detail)
    expect(fromDetail.id).toBe(fromList.id)
    expect(fromDetail.quantityOnHand).toBe(fromList.quantityOnHand)
  })

  it('falls back to quantity on a detail that carries no aggregated_quantity', () => {
    const { aggregated_quantity: _q, ...rest } = detail
    expect(transformStockLevel(rest).quantityOnHand).toBe(12)
  })

  it('maps minimum_quantity_required to reorderPoint, from a string', () => {
    expect(transformStockLevel(listed).reorderPoint).toBe(6)
  })

  it('keeps par and the ingredient-wide stock value in metadata, and the detail item-only amounts apart', () => {
    expect(transformStockLevel(detail).metadata).toEqual({
      name: 'Cola Can (33 cl)',
      par: '10.00',
      stock_value: '25.00',
      item_quantity: '12.00',
      item_stock_value: '18.20',
    })
  })

  it('keeps a list row stock_value as the stock value, with no item-only amounts', () => {
    expect(transformStockLevel(listed).metadata).toEqual({
      name: 'Cola Can (33 cl)',
      par: '15.00',
      stock_value: '0',
    })
  })

  it('leaves what Apicbase does not report unset, and treats a null par as absent', () => {
    const result = transformStockLevel({
      id: '421725380620004',
      par: null,
      minimum_quantity_required: null,
      quantity: -0.45,
      outlet_uid: 'o',
    })
    expect(result.reorderPoint).toBeUndefined()
    expect(result.quantityAvailable).toBeUndefined()
    expect(result.lastCountedAt).toBeUndefined()
    expect(result.metadata['par']).toBeUndefined()
  })

  it('reads 0 on hand when a row carries no quantity', () => {
    expect(transformStockLevel({ id: 'x', outlet_uid: 'o' }).quantityOnHand).toBe(0)
  })

  it('resolves productId from nested stock_item object', () => {
    const result = transformStockLevel({
      stock_item: { uid: 'ing-002' },
      outlet_uid: 'outlet-001',
      quantity: 5,
    })
    expect(result.productId).toBe('ing-002')
  })

  it('sets platform to apicbase', () => {
    expect(transformStockLevel(listed).platform).toBe('apicbase')
  })

  it('produces output that satisfies StockLevelSchema, from a list row and from the detail', () => {
    expect(() => StockLevelSchema.parse(transformStockLevel(listed))).not.toThrow()
    expect(() => StockLevelSchema.parse(transformStockLevel(detail))).not.toThrow()
  })
})
