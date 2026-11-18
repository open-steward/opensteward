import { describe, it, expect } from 'vitest'
import {
  transformReferenceToShipment,
  transformUpdateToShipment,
  type VizionReference,
  type VizionUpdateEvent,
  type VizionMilestone,
  type VizionPayload,
} from '../../../../../../../src/verticals/logistics/adapters/vizion-api/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeMilestone(overrides: Partial<VizionMilestone> = {}): VizionMilestone {
  return {
    timestamp: '2024-03-01T00:00:00Z',
    location: { name: 'Shanghai', city: 'Shanghai', country: 'CN', unlocode: 'CNSHA' },
    description: 'Vessel departed',
    planned: false,
    vessel: 'MV Acme Star',
    voyage: 'V042E',
    ...overrides,
  }
}

function makePayload(overrides: Partial<VizionPayload> = {}): VizionPayload {
  return {
    bill_of_lading: 'BL-2024-001',
    carrier_scac: 'MAEU',
    container_id: 'MSCU1234567',
    container_iso: '40HC',
    reference_id: 'REF-001',
    milestones: [makeMilestone()],
    origin_port: { name: 'Shanghai', unlocode: 'CNSHA' },
    destination_port: { name: 'Los Angeles', unlocode: 'USLAX' },
    ...overrides,
  }
}

function makeReference(overrides: Partial<VizionReference> = {}): VizionReference {
  return {
    id: 'REF-VIZ-001',
    container_id: 'MSCU1234567',
    carrier_scac: 'MAEU',
    carrier_code: null,
    active: true,
    last_update_status: 'IN_TRANSIT',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeUpdateEvent(overrides: Partial<VizionUpdateEvent> = {}): VizionUpdateEvent {
  return {
    id: 'EVT-001',
    status: 'DATA_RECEIVED',
    reference_id: 'REF-VIZ-001',
    organization_id: 'ORG-1',
    parent_reference_id: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    payload: makePayload(),
    ...overrides,
  }
}

// ─── transformReferenceToShipment ────────────────────────────────────────────

describe('transformReferenceToShipment (vizion-api)', () => {
  it('maps id from reference id', () => {
    const result = transformReferenceToShipment(makeReference())
    expect(result.id).toBe('REF-VIZ-001')
  })

  it('maps trackingNumber from container_id', () => {
    const result = transformReferenceToShipment(makeReference())
    expect(result.trackingNumber).toBe('MSCU1234567')
  })

  it('maps carrierId from carrier_scac', () => {
    const result = transformReferenceToShipment(makeReference())
    expect(result.carrierId).toBe('MAEU')
  })

  it('hardcodes mode to ocean', () => {
    const result = transformReferenceToShipment(makeReference())
    expect(result.mode).toBe('ocean')
  })

  it('maps ocean.containerNumber from container_id', () => {
    const result = transformReferenceToShipment(makeReference())
    expect(result.ocean?.containerNumber).toBe('MSCU1234567')
  })

  it('maps status IN_TRANSIT from last_update_status="IN_TRANSIT"', () => {
    const result = transformReferenceToShipment(makeReference({ last_update_status: 'IN_TRANSIT' }))
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps createdAt as a Date', () => {
    const result = transformReferenceToShipment(makeReference())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata through as raw object', () => {
    const raw = makeReference()
    expect(transformReferenceToShipment(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformReferenceToShipment(makeReference())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})

// ─── transformUpdateToShipment ────────────────────────────────────────────────

describe('transformUpdateToShipment (vizion-api)', () => {
  it('maps id from reference_id', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.id).toBe('REF-VIZ-001')
  })

  it('falls back id to event id when reference_id is absent', () => {
    const result = transformUpdateToShipment(makeUpdateEvent({ reference_id: null }))
    expect(result.id).toBe('EVT-001')
  })

  it('maps trackingNumber from payload.container_id', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.trackingNumber).toBe('MSCU1234567')
  })

  it('maps carrierId from payload.carrier_scac', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.carrierId).toBe('MAEU')
  })

  it('maps ocean.billOfLadingNumber from payload.bill_of_lading', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.ocean?.billOfLadingNumber).toBe('BL-2024-001')
  })

  it('maps ocean.containerType from payload.container_iso', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.ocean?.containerType).toBe('40HC')
  })

  it('maps ocean.vesselName from milestone with vessel', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.ocean?.vesselName).toBe('MV Acme Star')
  })

  it('maps ocean.voyageNumber from milestone with voyage', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.ocean?.voyageNumber).toBe('V042E')
  })

  it('maps ocean.portOfLoading from payload.origin_port.unlocode', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.ocean?.portOfLoading).toBe('CNSHA')
  })

  it('maps ocean.portOfDischarge from payload.destination_port.unlocode', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.ocean?.portOfDischarge).toBe('USLAX')
  })

  it('maps status IN_TRANSIT from "Vessel departed" non-planned milestone', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps status DELIVERED from "FINAL DELIVERY" milestone', () => {
    const event = makeUpdateEvent({
      payload: makePayload({
        milestones: [makeMilestone({ description: 'Final Delivery', planned: false })],
      }),
    })
    const result = transformUpdateToShipment(event)
    expect(result.status).toBe('DELIVERED')
  })

  it('hardcodes mode to ocean', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(result.mode).toBe('ocean')
  })

  it('passes metadata through as raw event', () => {
    const raw = makeUpdateEvent()
    expect(transformUpdateToShipment(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformUpdateToShipment(makeUpdateEvent())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
