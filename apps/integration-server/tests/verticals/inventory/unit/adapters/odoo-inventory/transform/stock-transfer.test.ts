/**
 * stock.picking (picking_type_code 'internal') and its stock.move rows;
 * fields from addons/stock/models/stock_picking.py and stock_move.py, 19.0.
 */
import { describe, expect, it } from 'vitest'
import { StockTransferSchema } from '../../../../../../../src/verticals/inventory/schema/stock-transfer'
import {
  transformStockTransfer,
  type RawOdooPicking,
} from '../../../../../../../src/verticals/inventory/adapters/odoo-inventory/transform/stock-transfer'

const picking = (state: string, date_done: string | false = false): RawOdooPicking => ({
  id: 12,
  name: 'WH/INT/00012',
  origin: 'Rebalance',
  state,
  scheduled_date: '2026-01-15 09:30:00',
  date_done,
  location_id: [8, 'WH/Stock'],
  location_dest_id: [20, 'WH2/Stock'],
  picking_type_code: 'internal',
})

const moves = [
  {
    id: 100,
    picking_id: [12, 'WH/INT/00012'],
    product_id: [42, 'Large Cabinet'],
    product_uom_qty: 50,
    quantity: 48,
  },
  {
    id: 101,
    picking_id: [12, 'WH/INT/00012'],
    product_id: [43, 'Desk'],
    product_uom_qty: 5,
    quantity: 5,
  },
] as const

describe('odoo-inventory transformStockTransfer', () => {
  it('maps a done transfer with its moves', () => {
    const t = StockTransferSchema.parse(
      transformStockTransfer(picking('done', '2026-01-16 10:00:00'), [...moves]),
    )
    expect(t).toMatchObject({
      id: '12',
      externalId: '12',
      number: 'WH/INT/00012',
      fromLocationId: '8',
      toLocationId: '20',
      status: 'completed',
      receivedAt: '2026-01-16T10:00:00.000Z',
      lines: [
        { productId: '42', quantity: 50, quantityReceived: 48 },
        { productId: '43', quantity: 5, quantityReceived: 5 },
      ],
    })
    expect(t.metadata).toMatchObject({ odooState: 'done', origin: 'Rebalance' })
  })

  it.each([
    ['draft', 'draft'],
    ['waiting', 'in_transit'],
    ['confirmed', 'in_transit'],
    ['assigned', 'in_transit'],
    ['cancel', 'cancelled'],
  ])('state %s is %s, with no received quantity or date', (state, status) => {
    const t = StockTransferSchema.parse(
      transformStockTransfer(picking(state, '2026-01-16 10:00:00'), [...moves]),
    )
    expect(t.status).toBe(status)
    expect(t.receivedAt).toBeUndefined()
    expect(t.lines[0]!.quantityReceived).toBeUndefined()
  })
})
