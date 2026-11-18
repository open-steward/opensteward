import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type PplCzShipment,
} from '../../../../../../../src/verticals/logistics/adapters/ppl-cz/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

describe('transformShipment', () => {
  it('maps shipmentNumber to id and trackingNumber', () => {
    const raw: PplCzShipment = {
      shipmentNumber: '41000012345',
      stateCode: 10,
      productType: 'BUSS',
    }
    const result = transformShipment(raw)
    expect(result.id).toBe('41000012345')
    expect(result.trackingNumber).toBe('41000012345')
  })

  it('maps stateCode to canonical ShipmentStatus', () => {
    expect(transformShipment({ stateCode: 0 }).status).toBe('PENDING')
    expect(transformShipment({ stateCode: 1 }).status).toBe('LABEL_CREATED')
    expect(transformShipment({ stateCode: 10 }).status).toBe('IN_TRANSIT')
    expect(transformShipment({ stateCode: 20 }).status).toBe('DELIVERED')
    expect(transformShipment({ stateCode: 21 }).status).toBe('OUT_FOR_DELIVERY')
    expect(transformShipment({ stateCode: 30 }).status).toBe('OUT_FOR_DELIVERY')
    expect(transformShipment({ stateCode: 50 }).status).toBe('RETURNED')
    expect(transformShipment({ stateCode: 60 }).status).toBe('CANCELLED')
    expect(transformShipment({ stateCode: 90 }).status).toBe('EXCEPTION')
    expect(transformShipment({ stateCode: null }).status).toBe('UNKNOWN')
  })

  it('maps productType to serviceCode', () => {
    expect(transformShipment({ productType: 'CONN' }).serviceCode).toBe('CONN')
  })

  it('converts weight (kg) to totalWeight', () => {
    const result = transformShipment({ weight: 2.5 })
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps insurance cost with currency', () => {
    const result = transformShipment({ insuranceValue: 5000, currency: 'CZK' })
    expect(result.cost?.amount).toBe(5000)
    expect(result.cost?.currency).toBe('CZK')
  })

  it('maps recipient to destinationAddress', () => {
    const raw: PplCzShipment = {
      recipient: {
        name: 'Jan Novák',
        street: 'Hlavní 42',
        city: 'Ostrava',
        zipCode: '70200',
        country: 'CZ',
      },
    }
    const result = transformShipment(raw)
    expect(result.destinationAddress?.name).toBe('Jan Novák')
    expect(result.destinationAddress?.city).toBe('Ostrava')
  })

  it('passes schema parse', () => {
    const raw: PplCzShipment = {
      shipmentNumber: '41000099998',
      stateCode: 10,
      productType: 'PRIV',
      weight: 1.2,
      insuranceValue: 3000,
      currency: 'CZK',
      estimatedDeliveryDate: '2024-03-01T00:00:00Z',
      lastStateChangeDate: '2024-02-28T00:00:00Z',
      recipient: { name: 'Test User', city: 'Prague', zipCode: '11000', country: 'CZ' },
    }
    const result = transformShipment(raw)
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
