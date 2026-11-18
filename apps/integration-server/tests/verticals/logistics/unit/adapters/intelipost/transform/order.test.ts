/**
 * Intelipost transformOrder, over the documented 200 example of
 * `GET /shipment_order/{pedido_de_entrega}` (../fixtures/shipment-order.json,
 * copied from the TMS Embarcador OpenAPI export).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transformOrder } from '../../../../../../../src/verticals/logistics/adapters/intelipost/transform/order'
import type { IntelipostShipmentOrderRaw } from '../../../../../../../src/verticals/logistics/adapters/intelipost/transform/shipment'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

const DOC = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/shipment-order.json'), 'utf8'),
) as {
  content: IntelipostShipmentOrderRaw
}

function doc(): IntelipostShipmentOrderRaw {
  return structuredClone(DOC.content)
}

function withVolumeStates(...states: string[]): IntelipostShipmentOrderRaw {
  const raw = doc()
  const [vol] = raw.shipment_order_volume_array ?? []
  raw.shipment_order_volume_array = states.map((s) => ({ ...vol, shipment_order_volume_state: s }))
  return raw
}

describe('intelipost transformOrder (documented example)', () => {
  it('parses with OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(doc()))).not.toThrow()
  })

  it('maps the documented order fields', () => {
    const o = OrderSchema.parse(transformOrder(doc()))
    expect(o.id).toBe('6474787')
    expect(o.orderNumber).toBe('PEDIDO-VENDA-001')
    expect(o.status).toBe('SHIPPED')
    expect(o.warehouseId).toBe('5944')
    expect(o.shipmentIds).toEqual(['6474787'])
    expect(o.requestedServiceCode).toBe('1')
    expect(o.orderAt?.toISOString()).toBe('2021-09-09T13:14:45.288Z')
    expect(o.shippedAt?.toISOString()).toBe('2021-09-09T14:01:00.000Z')
    expect(o.createdAt?.toISOString()).toBe('2021-09-09T13:14:45.288Z')
    expect(o.updatedAt?.toISOString()).toBe('2021-09-09T13:14:45.284Z')
    expect(o.deliveredAt).toBeUndefined()
    expect(o.destinationAddress?.city).toBe('São Paulo')
    expect(o.destinationAddress?.country).toBeUndefined()
    expect(o.originAddress?.street1).toBe('Rua Bela Cintra, 1149')
  })

  it('maps the volume products to line items', () => {
    expect(OrderSchema.parse(transformOrder(doc())).lineItems).toEqual([
      { id: '72173117', sku: 'CPM995324', description: 'Camiseta - Preta - M', quantity: 1 },
    ])
  })

  it('sets no currency or amounts: none is documented with a currency', () => {
    const o = transformOrder(doc())
    expect(o.currency).toBeUndefined()
    expect(o.totalAmount).toBeUndefined()
    expect(o.shippingAmount).toBeUndefined()
  })

  const cases: Array<[string, string]> = [
    ['NEW', 'PENDING'],
    ['CREATED_AT_LOGISTIC_PROVIDER', 'PROCESSING'],
    ['LABEL_CREATED', 'PROCESSING'],
    ['READY_FOR_SHIPPING', 'AWAITING_SHIPMENT'],
    ['WAITING_FOR_DROP_OFF', 'AWAITING_SHIPMENT'],
    ['CLARIFY_ADDRESS', 'ON_HOLD'],
    ['CLARIFY_LABEL_FAIL', 'ON_HOLD'],
    ['SHIPPED', 'SHIPPED'],
    ['IN_TRANSIT', 'SHIPPED'],
    ['TO_BE_DELIVERED', 'SHIPPED'],
    ['DELIVERED', 'DELIVERED'],
    ['CANCELLED', 'CANCELLED'],
    ['DELIVERY_FAILED', 'unknown'],
  ]
  for (const [state, status] of cases) {
    it(`${state} -> ${status}`, () => {
      expect(OrderSchema.parse(transformOrder(withVolumeStates(state))).status).toBe(status)
    })
  }

  it('is unknown when the volumes disagree', () => {
    expect(OrderSchema.parse(transformOrder(withVolumeStates('NEW', 'DELIVERED'))).status).toBe(
      'unknown',
    )
  })
})
