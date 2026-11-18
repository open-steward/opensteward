/**
 * Fixtures are the documented examples:
 *   - the closed "Count #4" and open "My Count" rows of GET
 *     /inventory/outlets/{outlet_id}/count_events/ (reference/get-top-counts);
 *   - the array GET …/count_events/{top_count_id}/stocks/ returns
 *     (reference/get-stock-items-in-a-top-count).
 */
import { describe, it, expect } from 'vitest'
import {
  transformStockAdjustment,
  type RawApicbaseCountedItem,
  type RawApicbaseTopCount,
} from '../../../../../../../src/verticals/inventory/adapters/apicbase/transform/stock-adjustment'
import { StockAdjustmentSchema } from '../../../../../../../src/verticals/inventory/schema/stock-adjustment'

const JOHN = {
  id: '236300957450001',
  username: 'john.doe@apicbase.com',
  first_name: 'John',
  last_name: 'Doe',
  url: 'https://app.apicbase.com/api/v2/accounts/users/236300957450001/',
}

const CLOSED: RawApicbaseTopCount = {
  id: '322471629160006',
  name: 'Count #4',
  status: 'Closed',
  full_count: true,
  created: '2020-06-17T14:01:55Z',
  actual_date: '2020-06-17T14:01:55Z',
  finished: '2020-06-17T14:02:39Z',
  created_by: JOHN,
  owned_by: JOHN,
  finished_by: JOHN,
  stock_value: '-6.00',
  remarks: 'Weekly stock take',
  stock_period: { id: '722371512760004', name: 'June 2020', status: 'Closed' },
}

const OPEN: RawApicbaseTopCount = {
  id: '422471249150002',
  name: 'My Count',
  status: 'Opened',
  full_count: false,
  created: '2020-06-17T14:02:43Z',
  actual_date: '2020-06-17T14:01:55Z',
  finished: null,
  created_by: JOHN,
  owned_by: JOHN,
  finished_by: JOHN,
  stock_value: null,
  remarks: null,
  stock_period: null,
}

const STOCKS: RawApicbaseCountedItem[] = [
  {
    stock_item: {
      id: '521093553960007',
      name: 'Apples Package (10 kg)',
      url: 'https://app.apicbase.com/api/v2/products/stock_items/521093553960007/',
    },
    quantity: '1.0000000000',
    inventory_log_entries: [
      {
        theoretical_quantity: '0.0000000000',
        quantity: '1.0000000000',
        variance_quantity: '1.0000000000',
        theoretical_value: '0.0000000000',
        counted_value: '27.9999600000',
        variance_value: '27.9999600000',
      },
    ],
  },
  {
    stock_item: {
      id: '321993625020001',
      name: 'Basmani Rice Recipe Z Pack (1 kg)',
      url: 'http://app.apicbase.com/api/v2/products/stock_items/321993625020001/',
    },
    quantity: '6.0000000000',
    inventory_log_entries: [
      {
        theoretical_quantity: '1.0000000000',
        quantity: '6.0000000000',
        variance_quantity: '5.0000000000',
        theoretical_value: '2.5000000000',
        counted_value: '15.0000000000',
        variance_value: '12.5000000000',
      },
    ],
  },
]

const OUTLET = '729100266010004'

describe('apicbase transformStockAdjustment', () => {
  it('maps the documented closed count and its counted items', () => {
    const result = StockAdjustmentSchema.parse(transformStockAdjustment(CLOSED, OUTLET, STOCKS))
    expect(result).toMatchObject({
      id: `322471629160006:${OUTLET}`,
      externalId: '322471629160006',
      locationId: OUTLET,
      reason: 'cycle_count',
      adjustedAt: '2020-06-17T14:01:55.000Z',
      adjustedBy: 'john.doe@apicbase.com',
      platform: 'apicbase',
    })
    expect(result.lines).toEqual([
      { productId: '521093553960007', deltaQuantity: 1, countedQuantity: 1, notes: undefined },
      { productId: '321993625020001', deltaQuantity: 5, countedQuantity: 6, notes: undefined },
    ])
    expect(result.metadata).toEqual({
      name: 'Count #4',
      status: 'Closed',
      full_count: 'true',
      created: '2020-06-17T14:01:55Z',
      finished: '2020-06-17T14:02:39Z',
      stock_value: '-6.00',
      remarks: 'Weekly stock take',
      stock_period_id: '722371512760004',
    })
  })

  it('sums every variation a closed count caused for one item', () => {
    const item: RawApicbaseCountedItem = {
      stock_item: { id: 's1' },
      quantity: '4.0',
      inventory_log_entries: [{ variance_quantity: '1.5' }, { variance_quantity: '-3.0' }],
    }
    const result = StockAdjustmentSchema.parse(transformStockAdjustment(CLOSED, OUTLET, [item]))
    expect(result.lines).toEqual([
      { productId: 's1', deltaQuantity: -1.5, countedQuantity: 4, notes: undefined },
    ])
  })

  it('makes no line of an item with no documented variation (a count not yet closed)', () => {
    const counted = STOCKS.map(({ inventory_log_entries: _entries, ...item }) => item)
    const open = StockAdjustmentSchema.parse(transformStockAdjustment(OPEN, OUTLET, counted))
    expect(open.lines).toEqual([])
    expect(open.adjustedAt).toBe('2020-06-17T14:01:55.000Z')
    expect(open.metadata['status']).toBe('Opened')
    expect(open.metadata['finished']).toBeUndefined()
    // An entry without a variance_quantity documents no delta either.
    const partial = transformStockAdjustment(CLOSED, OUTLET, [
      { stock_item: { id: 's1' }, quantity: '1', inventory_log_entries: [{ quantity: '1' }] },
    ])
    expect(partial.lines).toEqual([])
  })

  it('names as adjustedBy only the user who submitted the count', () => {
    // finished_by: "The user who submitted the top count. Mirrors `owned_by`."
    // The documented open count carries a finished_by while `finished` is null.
    const open = StockAdjustmentSchema.parse(transformStockAdjustment(OPEN, OUTLET, []))
    expect(open.adjustedBy).toBeUndefined()
    const other = { ...JOHN, id: '1', username: 'jane.roe@apicbase.com' }
    const closed = transformStockAdjustment({ ...CLOSED, owned_by: other }, OUTLET, [])
    expect(StockAdjustmentSchema.parse(closed).adjustedBy).toBe('john.doe@apicbase.com')
  })

  it('reads adjustedAt from created when actual_date is null', () => {
    const result = transformStockAdjustment({ ...CLOSED, actual_date: null }, OUTLET, [])
    expect(StockAdjustmentSchema.parse(result).adjustedAt).toBe('2020-06-17T14:01:55.000Z')
  })

  it('does not guess the zone of a time without an offset', () => {
    // The detail example's `created` is "2021-03-29T12:22:58", with no zone.
    expect(() =>
      transformStockAdjustment(
        { ...CLOSED, actual_date: null, created: '2021-03-29T12:22:58' },
        OUTLET,
        [],
      ),
    ).toThrow(/UTC offset/)
  })

  it('refuses a count with no id or no outlet rather than inventing one', () => {
    expect(() => transformStockAdjustment({ ...CLOSED, id: '' }, OUTLET, [])).toThrow(/no id/)
    expect(() => transformStockAdjustment(CLOSED, '', [])).toThrow(/no outlet/)
  })
})
