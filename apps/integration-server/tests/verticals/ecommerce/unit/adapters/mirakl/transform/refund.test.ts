/**
 * Mirakl RT11 return → canonical Refund.
 *
 * The fixture is the first row of the documented "Example with business
 * values" for RT11 (GET /api/returns) in
 * https://developer.mirakl.com/_spec/content/product/mmp/rest/seller/openapi3.json,
 * whose items carry `id`, `order_id`, `date_created`, `last_updated`,
 * `reason_code`, `description` and `return_lines[].{order_line_id,quantity}`
 * and no amount.
 */
import { describe, it, expect } from 'vitest'
import {
  transformReturn,
  type RawMiraklReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/mirakl/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function documented(): RawMiraklReturn {
  return {
    date_created: '2023-02-27T16:14:52Z',
    description: 'Description of return',
    documents: [{ id: 1337, type: 'SYSTEM_RETURN_LABEL' }],
    id: 'f61b5db8-d8f5-4715-b05f-aa4432c0e9e2',
    label_url: null,
    last_updated: '2023-02-27T16:14:52Z',
    method_code: 'RETURN_METHOD_BY_MAIL',
    order_commercial_id: 'ORDER-1',
    order_id: 'ORDER-1-A',
    reason_code: 'RETURN_CHANGED_MIND',
    rejection_reason_code: null,
    return_address: {
      city: 'New York',
      country_iso_code: 'USA',
      state: 'Manhattan',
      street1: '30, Prince Street',
      street2: '1st floor',
      zip_code: 'NY 10012',
    },
    return_lines: [
      {
        compliance: [
          {
            compliant: false,
            non_compliance_additional_info: 'There is a missing item',
            non_compliance_reason_code: 'RETURN_NON_COMPLIANT_MISSING_ITEM',
          },
        ],
        order_line_id: 'ORDER-1-A-1',
        quantity: 2,
      },
      { compliance: null, order_line_id: 'ORDER-1-A-2', quantity: 3 },
    ],
    rma: 'RETURN_RMA',
    state: 'WAITING_ACCEPTANCE',
    tracking: {
      carrier_standard_code: 'ups',
      tracking_number: '35H8O95K',
      tracking_url: 'https://wwwapps.ups.com/WebTracking/track?track=yes&trackNums=35H8O95K',
    },
  }
}

describe('transformReturn (Mirakl RT11)', () => {
  it('maps the documented example and parses as a canonical Refund', () => {
    const result = RefundSchema.parse(transformReturn(documented()))
    expect(result.id).toBe('f61b5db8-d8f5-4715-b05f-aa4432c0e9e2')
    expect(result.orderId).toBe('ORDER-1-A')
    expect(result.reason).toBe('RETURN_CHANGED_MIND')
    expect(result.note).toBe('Description of return')
    expect(result.createdAt).toBe('2023-02-27T16:14:52.000Z')
    expect(result.refundLineItems).toEqual([
      { lineItemId: 'ORDER-1-A-1', quantity: 2 },
      { lineItemId: 'ORDER-1-A-2', quantity: 3 },
    ])
  })

  it('takes createdAt from date_created, not last_updated (the documented second example row)', () => {
    const result = RefundSchema.parse(
      transformReturn({
        ...documented(),
        id: '2dc4f7d7-da59-4588-bec7-ce62daab2f93',
        date_created: '2023-02-27T16:32:52Z',
        last_updated: '2023-02-27T16:37:19Z',
      }),
    )
    expect(result.createdAt).toBe('2023-02-27T16:32:52.000Z')
  })

  it('reads the id only from the documented `id` field', () => {
    const result = transformReturn({ ...documented(), return_id: 'not-rt11' })
    expect(result.id).toBe('f61b5db8-d8f5-4715-b05f-aa4432c0e9e2')
  })

  it('invents nothing RT11 does not document: no amount, restock or processedAt', () => {
    const result = RefundSchema.parse(transformReturn(documented()))
    expect(result.amount).toBeUndefined()
    expect(result.restock).toBeUndefined()
    expect(result.processedAt).toBeUndefined()
    for (const line of result.refundLineItems ?? []) expect(line.amount).toBeUndefined()
  })

  it('keeps the return state and order commercial id in metadata', () => {
    const result = RefundSchema.parse(transformReturn(documented()))
    expect(result.metadata).toMatchObject({
      state: 'WAITING_ACCEPTANCE',
      order_commercial_id: 'ORDER-1',
      last_updated: '2023-02-27T16:14:52Z',
    })
  })

  it('omits optional fields RT11 leaves out', () => {
    const { description: _d, reason_code: _r, ...rest } = documented()
    const result = RefundSchema.parse(transformReturn({ ...rest, return_lines: [] }))
    expect(result.reason).toBeUndefined()
    expect(result.note).toBeUndefined()
    expect(result.refundLineItems).toEqual([])
  })

  it('throws rather than inventing an id when the required id is missing', () => {
    const { id: _id, ...rest } = documented()
    expect(() => transformReturn(rest as RawMiraklReturn)).toThrow(/id/)
  })

  it('throws rather than inventing an order id when the required order_id is missing', () => {
    const { order_id: _o, ...rest } = documented()
    expect(() => transformReturn(rest as RawMiraklReturn)).toThrow(/order_id/)
  })

  it('throws rather than inventing a line id when a return line lacks order_line_id', () => {
    const raw = { ...documented(), return_lines: [{ order_line_id: null, quantity: 2 }] }
    expect(() => transformReturn(raw)).toThrow(/return_lines\[0\]/)
  })

  it('throws rather than inventing a quantity when a return line lacks quantity', () => {
    const raw = {
      ...documented(),
      return_lines: [{ order_line_id: 'ORDER-1-A-1', quantity: null }],
    }
    expect(() => transformReturn(raw)).toThrow(/return_lines\[0\]/)
  })
})
