import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  transformTrackingEvents,
  type NeuroredTrackingEventRecord,
} from '../../../../../../../src/verticals/logistics/adapters/neurored/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeRecord(
  overrides: Partial<NeuroredTrackingEventRecord> = {},
): NeuroredTrackingEventRecord {
  return {
    Id: 'evt-SF-001',
    Name: 'TE-0001',
    NR_Shipment__c: 'ship-SF-001',
    NR_TrackingNumber__c: 'NR-TRACK-001',
    NR_Status__c: 'In Transit',
    NR_Description__c: 'Departed origin facility',
    NR_EventDate__c: '2024-03-02T10:00:00Z',
    NR_LocationCity__c: 'Chicago',
    NR_LocationState__c: 'IL',
    NR_LocationPostalCode__c: '60601',
    NR_LocationCountry__c: 'US',
    NR_LocationStreet__c: '100 Airport Blvd',
    ...overrides,
  }
}

describe('neurored transformTrackingEvent', () => {
  it('maps id from Id field', () => {
    expect(transformTrackingEvent(makeRecord()).id).toBe('evt-SF-001')
  })

  it('maps shipmentId from NR_Shipment__c', () => {
    expect(transformTrackingEvent(makeRecord()).shipmentId).toBe('ship-SF-001')
  })

  it('maps trackingNumber from NR_TrackingNumber__c', () => {
    expect(transformTrackingEvent(makeRecord()).trackingNumber).toBe('NR-TRACK-001')
  })

  it('hardcodes carrierId as "neurored"', () => {
    expect(transformTrackingEvent(makeRecord()).carrierId).toBe('neurored')
  })

  it('maps status "In Transit" → IN_TRANSIT (via TRACKING_STATUS_MAP)', () => {
    expect(transformTrackingEvent(makeRecord()).status).toBe('IN_TRANSIT')
  })

  it('maps status "Delivered" → DELIVERED', () => {
    expect(transformTrackingEvent(makeRecord({ NR_Status__c: 'Delivered' })).status).toBe(
      'DELIVERED',
    )
  })

  it('maps status "Planned" → PRE_TRANSIT', () => {
    expect(transformTrackingEvent(makeRecord({ NR_Status__c: 'Planned' })).status).toBe(
      'PRE_TRANSIT',
    )
  })

  it('maps status "Out for Delivery" → OUT_FOR_DELIVERY', () => {
    expect(transformTrackingEvent(makeRecord({ NR_Status__c: 'Out for Delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps status "Exception" → FAILURE', () => {
    expect(transformTrackingEvent(makeRecord({ NR_Status__c: 'Exception' })).status).toBe('FAILURE')
  })

  it('maps status "Return to Sender" → RETURN_TO_SENDER', () => {
    expect(transformTrackingEvent(makeRecord({ NR_Status__c: 'Return to Sender' })).status).toBe(
      'RETURN_TO_SENDER',
    )
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformTrackingEvent(makeRecord({ NR_Status__c: 'Mystery' })).status).toBe('UNKNOWN')
  })

  it('maps description from NR_Description__c', () => {
    expect(transformTrackingEvent(makeRecord()).description).toBe('Departed origin facility')
  })

  it('maps location from NR_Location*__c fields', () => {
    const result = transformTrackingEvent(makeRecord())
    expect(result.location?.city).toBe('Chicago')
    expect(result.location?.state).toBe('IL')
    expect(result.location?.country).toBe('US')
  })

  it('omits location when all location fields are absent', () => {
    const result = transformTrackingEvent(
      makeRecord({
        NR_LocationCity__c: undefined,
        NR_LocationState__c: undefined,
        NR_LocationPostalCode__c: undefined,
        NR_LocationCountry__c: undefined,
        NR_LocationStreet__c: undefined,
      }),
    )
    expect(result.location).toBeUndefined()
  })

  it('maps occurredAt from NR_EventDate__c', () => {
    const result = transformTrackingEvent(makeRecord())
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    expect(() => TrackingEventSchema.parse(transformTrackingEvent(makeRecord()))).not.toThrow()
  })

  it('transformTrackingEvents maps an array of records', () => {
    const results = transformTrackingEvents([makeRecord(), makeRecord({ Id: 'evt-SF-002' })])
    expect(results).toHaveLength(2)
    expect(results[1].id).toBe('evt-SF-002')
  })
})
