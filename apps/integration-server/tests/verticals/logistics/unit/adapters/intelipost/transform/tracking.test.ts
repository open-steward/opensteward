/**
 * Intelipost transformVolumeToTrackingEvents, over the documented 200 example
 * of `GET /shipment_order/{pedido_de_entrega}` (../fixtures/shipment-order.json,
 * copied from the TMS Embarcador OpenAPI export). Each volume carries its
 * history as `shipment_order_volume_state_history_array`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transformVolumeToTrackingEvents } from '../../../../../../../src/verticals/logistics/adapters/intelipost/transform/tracking'
import type { IntelipostShipmentOrderRaw } from '../../../../../../../src/verticals/logistics/adapters/intelipost/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

const DOC = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/shipment-order.json'), 'utf8'),
) as {
  content: IntelipostShipmentOrderRaw
}

function doc(): IntelipostShipmentOrderRaw {
  return structuredClone(DOC.content)
}

function events(raw = doc()) {
  const [vol] = raw.shipment_order_volume_array ?? []
  return transformVolumeToTrackingEvents(raw, vol).map((e) => TrackingEventSchema.parse(e))
}

describe('intelipost transformVolumeToTrackingEvents (documented example)', () => {
  it('emits one schema-valid event per history entry', () => {
    expect(events()).toHaveLength(2)
  })

  it('maps the documented history fields', () => {
    const [shipped, created] = events()
    expect(shipped).toMatchObject({
      id: '2301840269',
      shipmentId: '6474787',
      trackingNumber: 'PZ562304249BR',
      carrierId: 'Correios',
      status: 'IN_TRANSIT',
      description: 'Despachado',
    })
    expect(shipped.occurredAt?.toISOString()).toBe('2021-09-09T14:01:00.000Z')
    expect(shipped.createdAt?.toISOString()).toBe('2021-09-09T13:14:45.403Z')
    expect(created).toMatchObject({
      id: '2301840267',
      status: 'PRE_TRANSIT',
      description: 'Criado',
    })
    expect(created.occurredAt?.toISOString()).toBe('2021-09-09T14:00:00.000Z')
  })

  it('sets no location when every documented location field is null', () => {
    expect(events()[0].location).toBeUndefined()
  })

  it('maps a populated location', () => {
    const raw = doc()
    const entry = raw.shipment_order_volume_array![0].shipment_order_volume_state_history_array![0]
    entry.location = {
      address: 'Rua X',
      number: '10',
      city: 'Campinas',
      state_code: 'SP',
      zip_code: '13000-000',
    }
    expect(events(raw)[0].location).toEqual({
      street1: 'Rua X, 10',
      city: 'Campinas',
      state: 'SP',
      postalCode: '13000-000',
    })
  })

  it('emits nothing for a volume with no history (current state is not an event)', () => {
    const raw = doc()
    raw.shipment_order_volume_array![0].shipment_order_volume_state_history_array = []
    expect(events(raw)).toEqual([])
  })

  const cases: Array<[string, string]> = [
    ['NEW', 'PRE_TRANSIT'],
    ['CREATED_AT_LOGISTIC_PROVIDER', 'PRE_TRANSIT'],
    ['LABEL_CREATED', 'PRE_TRANSIT'],
    ['READY_FOR_SHIPPING', 'PRE_TRANSIT'],
    ['WAITING_FOR_DROP_OFF', 'PRE_TRANSIT'],
    ['SHIPPED', 'IN_TRANSIT'],
    ['IN_TRANSIT', 'IN_TRANSIT'],
    ['TO_BE_DELIVERED', 'OUT_FOR_DELIVERY'],
    ['DELIVERED', 'DELIVERED'],
    ['CLARIFY_ADDRESS', 'FAILURE'],
    ['CLARIFY_LABEL_FAIL', 'FAILURE'],
    ['CLARIFY_DELIVERY_FAIL', 'FAILURE'],
    ['DELIVERY_FAILED', 'FAILURE'],
    ['CANCELLED', 'UNKNOWN'],
  ]
  for (const [state, status] of cases) {
    it(`${state} -> ${status}`, () => {
      const raw = doc()
      raw.shipment_order_volume_array![0].shipment_order_volume_state_history_array![0].shipment_order_volume_state =
        state
      expect(events(raw)[0].status).toBe(status)
    })
  }
})
