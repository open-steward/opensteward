/**
 * Intelipost transformShipment, over the documented 200 example of
 * `GET /shipment_order/{pedido_de_entrega}` ("Consultar pedido de entrega"),
 * copied verbatim into ../fixtures/shipment-order.json from the TMS Embarcador
 * OpenAPI export:
 * https://stoplight.io/api/v1/projects/intelipost/tms-embarcador/nodes/reference/openapi.json?fromExportButton=true&snapshotType=http_service
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  transformShipment,
  type IntelipostShipmentOrderRaw,
} from '../../../../../../../src/verticals/logistics/adapters/intelipost/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

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
  raw.shipment_order_volume_array = states.map((s, i) => ({
    ...vol,
    shipment_order_volume_number: String(i + 1),
    tracking_code: `TRK${i + 1}`,
    shipment_order_volume_state: s,
  }))
  return raw
}

describe('intelipost transformShipment (documented example)', () => {
  it('parses with ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(transformShipment(doc()))).not.toThrow()
  })

  it('maps the documented order fields', () => {
    const s = ShipmentSchema.parse(transformShipment(doc()))
    expect(s.id).toBe('6474787')
    expect(s.reference).toBe('PEDIDO-VENDA-001')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.trackingNumber).toBe('PZ562304249BR')
    expect(s.carrierId).toBe('Correios')
    expect(s.serviceCode).toBe('1')
    expect(s.warehouseId).toBe('5944')
    expect(s.estimatedDeliveryAt?.toISOString()).toBe('2021-09-10T00:30:08.242Z')
    expect(s.createdAt?.toISOString()).toBe('2021-09-09T13:14:45.288Z')
    expect(s.updatedAt?.toISOString()).toBe('2021-09-09T13:14:45.284Z')
  })

  it('reads the ship-to address from end_customer and omits the non-ISO country', () => {
    const s = ShipmentSchema.parse(transformShipment(doc()))
    expect(s.destinationAddress).toEqual({
      name: 'Nome Sobrenome',
      street1: 'Rua Dr Amancio de Carvalho, 182',
      street2: 'Infos Adicionais, Vila Mariana',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '04012-080',
      phone: '1112345678',
      email: 'email@intelipost.com.br',
    })
  })

  it('reads the ship-from address from the origin_* fields', () => {
    const s = ShipmentSchema.parse(transformShipment(doc()))
    expect(s.originAddress).toEqual({
      name: 'CD Teste',
      street1: 'Rua Bela Cintra, 1149',
      street2: 'Consolação',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01415001',
      phone: '1133350200',
      email: 'leonardofelix@intelipost.com.br',
    })
  })

  it('sets no cost: customer_shipping_costs has no documented currency', () => {
    expect(transformShipment(doc()).cost).toBeUndefined()
  })

  it('keeps the raw response as metadata', () => {
    expect(transformShipment(doc()).metadata?.['id']).toBe(275802643)
  })
})

describe('intelipost transformShipment status from volume states', () => {
  const cases: Array<[string, string]> = [
    ['NEW', 'PENDING'],
    ['CREATED_AT_LOGISTIC_PROVIDER', 'PENDING'],
    ['LABEL_CREATED', 'LABEL_CREATED'],
    ['READY_FOR_SHIPPING', 'LABEL_CREATED'],
    ['WAITING_FOR_DROP_OFF', 'LABEL_CREATED'],
    ['SHIPPED', 'IN_TRANSIT'],
    ['IN_TRANSIT', 'IN_TRANSIT'],
    ['TO_BE_DELIVERED', 'OUT_FOR_DELIVERY'],
    ['DELIVERED', 'DELIVERED'],
    ['CLARIFY_ADDRESS', 'EXCEPTION'],
    ['CLARIFY_LABEL_FAIL', 'EXCEPTION'],
    ['CLARIFY_DELIVERY_FAIL', 'EXCEPTION'],
    ['DELIVERY_FAILED', 'EXCEPTION'],
    ['CANCELLED', 'CANCELLED'],
    ['KEEP_PREVIOUS', 'UNKNOWN'],
  ]
  for (const [state, status] of cases) {
    it(`${state} -> ${status}`, () => {
      expect(ShipmentSchema.parse(transformShipment(withVolumeStates(state))).status).toBe(status)
    })
  }

  it('is UNKNOWN when the volumes disagree, with no single tracking number', () => {
    const s = ShipmentSchema.parse(transformShipment(withVolumeStates('SHIPPED', 'DELIVERED')))
    expect(s.status).toBe('UNKNOWN')
    expect(s.trackingNumber).toBeUndefined()
  })

  it('reads trackingNumber from the volume tracking_code, not logistic_provider_tracking_code', () => {
    const raw = doc()
    const [vol] = raw.shipment_order_volume_array ?? []
    // Both fields hold the same code in the documented example; make them differ.
    Object.assign(vol ?? {}, {
      tracking_code: 'TRACKING-CODE',
      logistic_provider_tracking_code: 'PROVIDER-CODE',
    })
    expect(ShipmentSchema.parse(transformShipment(raw)).trackingNumber).toBe('TRACKING-CODE')
  })

  it('uses the shared state of several volumes', () => {
    expect(transformShipment(withVolumeStates('DELIVERED', 'DELIVERED')).status).toBe('DELIVERED')
  })

  it('is UNKNOWN with no volumes', () => {
    const raw = doc()
    raw.shipment_order_volume_array = []
    expect(ShipmentSchema.parse(transformShipment(raw)).status).toBe('UNKNOWN')
  })
})
