import { describe, it, expect } from 'vitest'
import {
  transformPickupShipment,
  transformBolShipment,
  type RlCarriersPickupResponse,
  type RlCarriersBolResponse,
} from '../../../../../../../src/verticals/logistics/adapters/rl-carriers/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makePickupRaw(
  overrides: Partial<RlCarriersPickupResponse> = {},
): RlCarriersPickupResponse {
  return {
    ConfirmationNumber: 'CONF-001',
    ProNumber: 'PRO-001',
    PickupDate: '2024-03-01T00:00:00Z',
    Status: 'Scheduled',
    ...overrides,
  }
}

function makeBolRaw(overrides: Partial<RlCarriersBolResponse> = {}): RlCarriersBolResponse {
  return {
    BolNumber: 'BOL-001',
    ProNumber: 'PRO-001',
    PickupDate: '2024-03-01T00:00:00Z',
    EstimatedDeliveryDate: '2024-03-05T00:00:00Z',
    TotalCharges: 350.0,
    Shipper: {
      Name: 'Shipper Co',
      CompanyName: 'Shipper Industries',
      Address1: '100 Shipper Rd',
      City: 'Chicago',
      State: 'IL',
      Zip: '60601',
      Country: 'US',
    },
    Consignee: {
      Name: 'Receiver Inc',
      CompanyName: 'Receiver LLC',
      Address1: '200 Receiver Ave',
      City: 'Los Angeles',
      State: 'CA',
      Zip: '90001',
      Country: 'US',
    },
    Status: 'in transit',
    ...overrides,
  }
}

// ─── transformPickupShipment ──────────────────────────────────────────────────

describe('RL-Carriers transformPickupShipment', () => {
  it('maps id from ConfirmationNumber', () => {
    const result = transformPickupShipment(makePickupRaw())
    expect(result.id).toBe('CONF-001')
  })

  it('maps trackingNumber from ProNumber', () => {
    const result = transformPickupShipment(makePickupRaw())
    expect(result.trackingNumber).toBe('PRO-001')
  })

  it('sets carrierId to rl-carriers', () => {
    expect(transformPickupShipment(makePickupRaw()).carrierId).toBe('rl-carriers')
  })

  it('sets mode to ltl', () => {
    expect(transformPickupShipment(makePickupRaw()).mode).toBe('ltl')
  })

  it('sets status to PENDING', () => {
    expect(transformPickupShipment(makePickupRaw()).status).toBe('PENDING')
  })

  it('maps reference from ConfirmationNumber', () => {
    expect(transformPickupShipment(makePickupRaw()).reference).toBe('CONF-001')
  })

  it('createdAt is a Date', () => {
    expect(transformPickupShipment(makePickupRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformPickupShipment(makePickupRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})

// ─── transformBolShipment ─────────────────────────────────────────────────────

describe('RL-Carriers transformBolShipment', () => {
  it('maps id from BolNumber', () => {
    const result = transformBolShipment(makeBolRaw())
    expect(result.id).toBe('BOL-001')
  })

  it('maps trackingNumber from ProNumber', () => {
    const result = transformBolShipment(makeBolRaw())
    expect(result.trackingNumber).toBe('PRO-001')
  })

  it('maps "in transit" status to IN_TRANSIT', () => {
    const result = transformBolShipment(makeBolRaw())
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps "delivered" status to DELIVERED', () => {
    const result = transformBolShipment(makeBolRaw({ Status: 'delivered' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps "bol" status to LABEL_CREATED', () => {
    const result = transformBolShipment(makeBolRaw({ Status: 'bol created' }))
    expect(result.status).toBe('LABEL_CREATED')
  })

  it('defaults to PENDING for unknown statuses', () => {
    const result = transformBolShipment(makeBolRaw({ Status: undefined }))
    expect(result.status).toBe('PENDING')
  })

  it('maps origin and destination addresses', () => {
    const result = transformBolShipment(makeBolRaw())
    expect(result.originAddress?.city).toBe('Chicago')
    expect(result.destinationAddress?.city).toBe('Los Angeles')
  })

  it('maps TotalCharges to cost in USD', () => {
    const result = transformBolShipment(makeBolRaw())
    expect(result.cost?.amount).toBe(350.0)
    expect(result.cost?.currency).toBe('USD')
  })

  it('maps EstimatedDeliveryDate to estimatedDeliveryAt', () => {
    const result = transformBolShipment(makeBolRaw())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('sets mode to ltl', () => {
    expect(transformBolShipment(makeBolRaw()).mode).toBe('ltl')
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformBolShipment(makeBolRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
