import { describe, it, expect } from 'vitest'
import {
  transformStockTransfer,
  type RawApicbaseTransferEvent,
} from '../../../../../../../src/verticals/inventory/adapters/apicbase/transform/stock-transfer'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'

describe('apicbase transformStockTransfer', () => {
  const raw: RawApicbaseTransferEvent = {
    uid: 'transfer-001',
    status: 2,
    created_date: '2024-03-01T00:00:00Z',
    actual_date: '2024-03-01T00:00:00Z',
    remarks: 'Monthly restock',
    owned_by: 'user-001',
    outlet: { uid: 'outlet-src' },
    items: [
      {
        stock_item: { uid: 'ing-001' },
        quantity: 10,
      },
    ],
  }

  it('maps id from uid', () => {
    const result = transformStockTransfer(raw, 'outgoing')
    expect(result.id).toBe('transfer-001')
    expect(result.externalId).toBe('transfer-001')
  })

  it('for outgoing, outlet is fromLocationId', () => {
    const result = transformStockTransfer(raw, 'outgoing')
    expect(result.fromLocationId).toBe('outlet-src')
    expect(result.toLocationId).toBe('')
  })

  it('for incoming, outlet is toLocationId', () => {
    const result = transformStockTransfer(raw, 'incoming')
    expect(result.fromLocationId).toBe('')
    expect(result.toLocationId).toBe('outlet-src')
  })

  it('maps status 2 to completed', () => {
    const result = transformStockTransfer(raw, 'outgoing')
    expect(result.status).toBe('completed')
  })

  it('maps status 0 to draft', () => {
    const result = transformStockTransfer({ ...raw, status: 0 }, 'outgoing')
    expect(result.status).toBe('draft')
  })

  it('maps status 1 to in_transit', () => {
    const result = transformStockTransfer({ ...raw, status: 1 }, 'outgoing')
    expect(result.status).toBe('in_transit')
  })

  it('maps line items with productId and quantity', () => {
    const result = transformStockTransfer(raw, 'outgoing')
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('ing-001')
    expect(result.lines[0]!.quantity).toBe(10)
  })

  it('sets shippedAt for outgoing transfers', () => {
    const result = transformStockTransfer(raw, 'outgoing')
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBeUndefined()
  })

  it('sets receivedAt for incoming transfers', () => {
    const result = transformStockTransfer(raw, 'incoming')
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.shippedAt).toBeUndefined()
  })

  it('sets platform to apicbase', () => {
    const result = transformStockTransfer(raw, 'outgoing')
    expect(result.platform).toBe('apicbase')
  })

  it('produces output that satisfies StockTransferSchema', () => {
    const result = transformStockTransfer(raw, 'outgoing')
    expect(() => StockTransferSchema.parse(result)).not.toThrow()
  })
})

/**
 * Rows as Apicbase documents them (developers.apicbase.com/reference/
 * get-incoming-transfer-events and get-outgoing-transfer-events). Neither
 * names the outlet it was listed from, which the adapter injects as `outlet`;
 * the other end is an outlet URL. Incoming rows carry `status: "Closed"`,
 * outgoing rows `in_progress` instead, and both carry `created`, not
 * `created_date`. The transform used to read a numeric status only, so every
 * documented transfer came out 'draft', with one end blank.
 */
describe('apicbase transformStockTransfer on documented rows', () => {
  const incoming: RawApicbaseTransferEvent = {
    id: '722162682470005',
    name: 'My Transfer Event',
    status: 'Closed',
    created: '2021-03-24T02:15:34Z',
    finished: '2021-03-24T02:15:46Z',
    actual_date: null,
    remarks: '',
    stock_value: '50.00',
    items: [
      {
        stock_item: {
          id: '721836208200002',
          name: 'Açai Bottle (1 l)',
          url: 'https://app.apicbase.com/api/v2/products/stock_items/721836208200002/',
        },
        quantity: '10',
        stock_value: '50.00',
        remarks: null,
      },
    ],
    origin_outlet: 'https://app.apicbase.com/api/v2/accounts/outlets/729100266010004/',
    outlet: '829100725420008',
  }

  const outgoing: RawApicbaseTransferEvent = {
    id: '122162992420000',
    name: 'My Transfer Event',
    in_progress: false,
    created: '2021-03-24T02:17:17Z',
    finished: '2021-03-24T02:17:31Z',
    actual_date: null,
    remarks: '',
    stock_value: '-75.00',
    items: [
      {
        stock_item: {
          id: '421836548240007',
          name: 'Bread 1 kg',
          url: 'https://app.apicbase.com/api/v2/products/stock_items/421836548240007/',
        },
        quantity: '10',
        stock_value: '-75.00',
        remarks: null,
      },
    ],
    destination_outlet: 'https://app.apicbase.com/api/v2/accounts/outlets/729100266010004/',
    outlet: '829100725420008',
  }

  it('fills both ends of an incoming transfer: the origin URL and the outlet it was listed at', () => {
    const result = transformStockTransfer(incoming, 'incoming')
    expect([result.fromLocationId, result.toLocationId]).toEqual([
      '729100266010004',
      '829100725420008',
    ])
  })

  it('fills both ends of an outgoing transfer: the outlet it was listed at and the destination URL', () => {
    const result = transformStockTransfer(outgoing, 'outgoing')
    expect([result.fromLocationId, result.toLocationId]).toEqual([
      '829100725420008',
      '729100266010004',
    ])
  })

  it('reads a bare outlet id as it is, and a URL naming no outlet as unknown', () => {
    expect(
      transformStockTransfer({ ...incoming, origin_outlet: '729100266010004' }, 'incoming')
        .fromLocationId,
    ).toBe('729100266010004')
    expect(
      transformStockTransfer(
        { ...incoming, origin_outlet: 'https://example.com/elsewhere/' },
        'incoming',
      ).fromLocationId,
    ).toBe('')
  })

  it('maps the status label "Closed" to completed', () => {
    expect(transformStockTransfer(incoming, 'incoming').status).toBe('completed')
  })

  it('maps the status label "Opened" to draft, the same as in_progress: true', () => {
    // The documented outgoing event (reference/claim-outgoing-transfer-event):
    // "finished": null, ... "status": "Opened", "name": "Transfer #18".
    const opened: RawApicbaseTransferEvent = {
      id: '322571969510001',
      created: '2026-05-25T08:55:42Z',
      finished: null,
      actual_date: null,
      remarks: '',
      stock_value: '-5.37',
      items: [
        {
          stock_item: {
            id: '421836548240007',
            name: 'Bread 1 kg',
            url: 'https://app.apicbase.com/api/v2/products/stock_items/421836548240007/',
          },
          quantity: '2',
          stock_value: '-5.37',
        },
      ],
      destination_outlet: 'https://app.apicbase.com/api/v2/accounts/outlets/429100059300001/',
      status: 'Opened',
      name: 'Transfer #18',
      outlet: '829100725420008',
    }
    const result = transformStockTransfer(opened, 'outgoing')
    expect(result.status).toBe('draft')
    expect(result.status).toBe(
      transformStockTransfer({ ...outgoing, in_progress: true }, 'outgoing').status,
    )
    expect([result.fromLocationId, result.toLocationId]).toEqual([
      '829100725420008',
      '429100059300001',
    ])
  })

  it('maps an outgoing row by in_progress: finished is completed, in progress is draft', () => {
    expect(transformStockTransfer(outgoing, 'outgoing').status).toBe('completed')
    expect(transformStockTransfer({ ...outgoing, in_progress: true }, 'outgoing').status).toBe(
      'draft',
    )
  })

  it('maps a status it does not know, or none at all, to unknown rather than draft', () => {
    expect(
      transformStockTransfer({ ...incoming, status: 'Something new' }, 'incoming').status,
    ).toBe('unknown')
    expect(transformStockTransfer({ ...outgoing, in_progress: null }, 'outgoing').status).toBe(
      'unknown',
    )
    expect(
      transformStockTransfer({ ...outgoing, in_progress: undefined, status: 7 }, 'outgoing').status,
    ).toBe('unknown')
  })

  it('reads line quantities from strings and products from the stock item id', () => {
    expect(transformStockTransfer(incoming, 'incoming').lines).toEqual([
      { productId: '721836208200002', quantity: 10, quantityReceived: undefined },
    ])
  })

  it('keeps created, finished and the raw status in metadata', () => {
    expect(transformStockTransfer(incoming, 'incoming').metadata).toMatchObject({
      direction: 'incoming',
      rawStatus: 'Closed',
      created_date: '2021-03-24T02:15:34Z',
      finished: '2021-03-24T02:15:46Z',
    })
    expect(transformStockTransfer(outgoing, 'outgoing').metadata).toMatchObject({
      direction: 'outgoing',
      in_progress: 'false',
      created_date: '2021-03-24T02:17:17Z',
    })
  })

  it('produces output that satisfies StockTransferSchema', () => {
    expect(() =>
      StockTransferSchema.parse(transformStockTransfer(incoming, 'incoming')),
    ).not.toThrow()
    expect(() =>
      StockTransferSchema.parse(transformStockTransfer(outgoing, 'outgoing')),
    ).not.toThrow()
  })
})
