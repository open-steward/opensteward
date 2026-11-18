import { describe, it, expect } from 'vitest'
import { transformShipment } from '../../../../../../../src/verticals/logistics/adapters/ctt/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { shipment } from '../fixtures'

describe('CTT transformShipment', () => {
  it('maps the documented newsince fields and parses as a canonical Shipment', () => {
    const out = ShipmentSchema.parse(transformShipment(shipment(501)))
    expect(out.id).toBe('501')
    expect(out.carrierId).toBe('3')
    expect(out.serviceCode).toBe('12')
    expect(out.reference).toBe('ORDER-501')
    expect(out.notes).toBe('Fragile | Ring twice')
    expect(out.createdAt).toEqual(new Date('2026-09-23T09:15:00Z'))
    expect(out.destinationAddress).toEqual({
      name: 'Ana Silva',
      company: 'Loja Exemplo',
      street1: 'Rua Augusta 100 2E',
      street2: 'Baixa',
      city: 'Lisboa',
      postalCode: '1100-053',
      phone: '+351210000000',
      email: 'ana@example.test',
    })
  })

  it('sets no status, tracking number or cost: the reply documents none', () => {
    const out = transformShipment(shipment(1))
    expect(out.status).toBeUndefined()
    expect(out.trackingNumber).toBeUndefined()
    expect(out.cost).toBeUndefined()
  })

  it('leaves the ISO3 country out of the alpha-2 address and keeps it in metadata', () => {
    const out = transformShipment(shipment(1))
    expect(out.destinationAddress?.country).toBeUndefined()
    expect((out.metadata?.['Recipient'] as { Country: string }).Country).toBe('PRT')
  })

  it('names no carrier when the reply has no CarrierId', () => {
    const raw = { ...shipment(1), CarrierId: undefined }
    expect(ShipmentSchema.parse(transformShipment(raw)).carrierId).toBeUndefined()
  })
})
