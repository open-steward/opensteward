import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type JadlogShipment,
} from '../../../../../../../src/verticals/logistics/adapters/jadlog/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<JadlogShipment> = {}): JadlogShipment {
  return {
    idpedido: '12345',
    nrpedido: 'NR-001',
    codigo: 'COD001',
    cte: 'CTE001',
    status: 'EM',
    modalidade: 3,
    peso: 1.5,
    vltotal: 50.0,
    nomeRemetente: 'Alice Remetente',
    enderecoRemetente: 'Rua A',
    cidadeRemetente: 'São Paulo',
    ufRemetente: 'SP',
    cepRemetente: '01310-100',
    nomeDestinatario: 'Bob Destinatario',
    enderecoDestinatario: 'Av B',
    cidadeDestinatario: 'Rio de Janeiro',
    ufDestinatario: 'RJ',
    cepDestinatario: '20040-020',
    dtpedido: '2024-03-01T00:00:00Z',
    dtprevisao: '2024-03-06T00:00:00Z',
    ...overrides,
  }
}

describe('jadlog transformShipment', () => {
  it('maps idpedido to id', () => {
    expect(transformShipment(makeRaw()).id).toBe('12345')
  })

  it('maps EM status to IN_TRANSIT', () => {
    expect(transformShipment(makeRaw()).status).toBe('IN_TRANSIT')
  })

  it('maps PE status to LABEL_CREATED', () => {
    expect(transformShipment(makeRaw({ status: 'PE' })).status).toBe('LABEL_CREATED')
  })

  it('maps SA status to OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeRaw({ status: 'SA' })).status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps EN status to DELIVERED', () => {
    expect(transformShipment(makeRaw({ status: 'EN' })).status).toBe('DELIVERED')
  })

  it('maps CA status to CANCELLED', () => {
    expect(transformShipment(makeRaw({ status: 'CA' })).status).toBe('CANCELLED')
  })

  it('maps DV status to RETURNED', () => {
    expect(transformShipment(makeRaw({ status: 'DV' })).status).toBe('RETURNED')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformShipment(makeRaw({ status: 'ZZ' })).status).toBe('UNKNOWN')
  })

  it('maps tracking code', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('COD001')
  })

  it('maps carrierId to jadlog', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('jadlog')
  })

  it('maps weight in kg', () => {
    const r = transformShipment(makeRaw())
    expect(r.totalWeight?.value).toBe(1.5)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('maps origin address', () => {
    const r = transformShipment(makeRaw())
    expect(r.originAddress?.name).toBe('Alice Remetente')
    expect(r.originAddress?.city).toBe('São Paulo')
    expect(r.originAddress?.country).toBe('BR')
  })

  it('maps destination address', () => {
    const r = transformShipment(makeRaw())
    expect(r.destinationAddress?.name).toBe('Bob Destinatario')
    expect(r.destinationAddress?.city).toBe('Rio de Janeiro')
  })

  it('maps cost with BRL currency', () => {
    const r = transformShipment(makeRaw())
    expect(r.cost?.amount).toBe(50.0)
    expect(r.cost?.currency).toBe('BRL')
  })

  it('createdAt is a Date', () => {
    expect(transformShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('estimatedDeliveryAt is a Date', () => {
    expect(transformShipment(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes schema validation', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeRaw()))).not.toThrow()
  })
})
