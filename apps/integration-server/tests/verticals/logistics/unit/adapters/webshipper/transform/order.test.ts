import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type WebshipperOrder,
} from '../../../../../../../src/verticals/logistics/adapters/webshipper/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(overrides: Partial<WebshipperOrder> = {}): WebshipperOrder {
  return {
    id: 'ws-ord-001',
    type: 'orders',
    attributes: {
      status: 'dispatched',
      ext_ref: 'EXT-2024-001',
      visible_ref: 'VIS-2024-001',
      currency: 'USD',
      order_lines: [
        {
          id: 'ol-1',
          sku: 'SKU-ABC',
          description: 'Blue Widget',
          quantity: 2,
          unit_price: 999,
          total_price: 1998,
        },
      ],
      delivery_address: {
        name: 'Bob Receiver',
        city: 'Copenhagen',
        postal_code: '1050',
        country: 'DK',
      },
      sender_address: {
        name: 'Alice Sender',
        city: 'Aarhus',
        postal_code: '8000',
        country: 'DK',
      },
      total_price: 1998,
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T15:00:00Z',
    },
    ...overrides,
  }
}

describe('transformOrder (webshipper)', () => {
  it('maps id from raw.id', () => {
    expect(transformOrder(makeRaw()).id).toBe('ws-ord-001')
  })

  it('maps orderNumber from attributes.visible_ref', () => {
    expect(transformOrder(makeRaw()).orderNumber).toBe('VIS-2024-001')
  })

  it('falls back orderNumber to ext_ref when visible_ref absent', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, visible_ref: null } })
    expect(transformOrder(raw).orderNumber).toBe('EXT-2024-001')
  })

  it('maps status dispatched → SHIPPED', () => {
    expect(transformOrder(makeRaw()).status).toBe('SHIPPED')
  })

  it('maps status pending → PENDING', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'pending' } })
    expect(transformOrder(raw).status).toBe('PENDING')
  })

  it('maps status on_hold → ON_HOLD', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'on_hold' } })
    expect(transformOrder(raw).status).toBe('ON_HOLD')
  })

  it('maps status partly_dispatched → PROCESSING', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'partly_dispatched' } })
    expect(transformOrder(raw).status).toBe('PROCESSING')
  })

  it('maps status cancelled → CANCELLED', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'cancelled' } })
    expect(transformOrder(raw).status).toBe('CANCELLED')
  })

  it('maps status error → ON_HOLD', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'error' } })
    expect(transformOrder(raw).status).toBe('ON_HOLD')
  })

  it('maps unknown status → UNKNOWN', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, status: 'mystery' } })
    expect(transformOrder(raw).status).toBe('UNKNOWN')
  })

  it('maps currency', () => {
    expect(transformOrder(makeRaw()).currency).toBe('USD')
  })

  it('maps destinationAddress city', () => {
    expect(transformOrder(makeRaw()).destinationAddress?.city).toBe('Copenhagen')
  })

  it('maps destinationAddress country', () => {
    expect(transformOrder(makeRaw()).destinationAddress?.country).toBe('DK')
  })

  it('maps originAddress city', () => {
    expect(transformOrder(makeRaw()).originAddress?.city).toBe('Aarhus')
  })

  it('maps lineItems from order_lines', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.sku).toBe('SKU-ABC')
    expect(result.lineItems?.[0]?.quantity).toBe(2)
  })

  it('maps totalAmount from total_price', () => {
    expect(transformOrder(makeRaw()).totalAmount).toBe(1998)
  })

  it('maps createdAt from attributes.created_at', () => {
    expect(transformOrder(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from attributes.updated_at', () => {
    expect(transformOrder(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces output that parses against OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })
})
