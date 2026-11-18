import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type NovaPoshtaShipment,
} from '../../../../../../../src/verticals/logistics/adapters/nova-poshta/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<NovaPoshtaShipment> = {}): NovaPoshtaShipment {
  return {
    id: 'ship-001',
    number: 'TTN-20240301-001',
    status: 'InTransit',
    statusCode: 2,
    serviceCode: 'standard',
    recipient: {
      fullName: 'Bob Receiver',
      phone: '+380501234567',
      email: 'bob@example.com',
      city: 'Lviv',
      countryCode: 'UA',
    },
    sender: {
      fullName: 'Alice Sender',
      phone: '+380671234567',
      email: 'alice@example.com',
      city: 'Kyiv',
      countryCode: 'UA',
    },
    weight: 3.5,
    volumetricWeight: 4.0,
    length: 30,
    width: 20,
    height: 15,
    declaredCost: 500,
    currency: 'UAH',
    labelUrl: 'https://example.com/label.pdf',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    actualDeliveryDate: null,
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T08:00:00Z',
    warehouseId: 'wh-001',
    description: 'Electronics',
    payerType: 'Sender',
    ...overrides,
  }
}

describe('nova-poshta transformShipment', () => {
  it('maps id from raw.id', () => {
    expect(transformShipment(makeShipment()).id).toBe('ship-001')
  })

  it('maps trackingNumber from number (TTN)', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('TTN-20240301-001')
  })

  it('maps reference from number (TTN)', () => {
    expect(transformShipment(makeShipment()).reference).toBe('TTN-20240301-001')
  })

  it('hardcodes carrierId as "nova-poshta"', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('nova-poshta')
  })

  it('maps serviceCode', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('standard')
  })

  it('maps warehouseId', () => {
    expect(transformShipment(makeShipment()).warehouseId).toBe('wh-001')
  })

  it('maps status "InTransit" → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps status "Delivered" → DELIVERED', () => {
    expect(transformShipment(makeShipment({ status: 'Delivered' })).status).toBe('DELIVERED')
  })

  it('maps status "Created" → LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ status: 'Created' })).status).toBe('LABEL_CREATED')
  })

  it('maps status "OutForDelivery" → OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeShipment({ status: 'OutForDelivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps status "Returned" → RETURNED', () => {
    expect(transformShipment(makeShipment({ status: 'Returned' })).status).toBe('RETURNED')
  })

  it('maps status "Cancelled" → CANCELLED', () => {
    expect(transformShipment(makeShipment({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status "Exception" → EXCEPTION', () => {
    expect(transformShipment(makeShipment({ status: 'Exception' })).status).toBe('EXCEPTION')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformShipment(makeShipment({ status: 'Mystery' })).status).toBe('UNKNOWN')
  })

  it('maps destinationAddress from recipient', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('Lviv')
  })

  it('maps originAddress from sender', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('Kyiv')
  })

  it('maps totalWeight from weight in kg', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(3.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('falls back totalWeight to volumetricWeight when weight is null', () => {
    const result = transformShipment(makeShipment({ weight: null }))
    expect(result.totalWeight?.value).toBe(4.0)
  })

  it('maps cost from declaredCost and currency', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(500)
    expect(result.cost?.currency).toBe('UAH')
  })

  it('omits cost when declaredCost is null', () => {
    expect(transformShipment(makeShipment({ declaredCost: null })).cost).toBeUndefined()
  })

  it('defaults cost currency to "UAH" when currency is null', () => {
    const result = transformShipment(makeShipment({ currency: null }))
    expect(result.cost?.currency).toBe('UAH')
  })

  it('maps labelUrl', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe('https://example.com/label.pdf')
  })

  it('maps notes from description', () => {
    expect(transformShipment(makeShipment()).notes).toBe('Electronics')
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt as Date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt as Date', () => {
    expect(transformShipment(makeShipment()).updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})
