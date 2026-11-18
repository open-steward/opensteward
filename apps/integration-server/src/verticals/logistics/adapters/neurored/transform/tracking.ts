import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

/**
 * Raw Salesforce record shape for the NR_TrackingEvent__c custom object.
 */
export interface NeuroredTrackingEventRecord {
  Id: string
  Name?: string
  NR_Shipment__c?: string
  NR_TrackingNumber__c?: string
  NR_Status__c?: string
  NR_Description__c?: string
  NR_EventDate__c?: string
  NR_LocationCity__c?: string
  NR_LocationState__c?: string
  NR_LocationPostalCode__c?: string
  NR_LocationCountry__c?: string
  NR_LocationStreet__c?: string
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(record: NeuroredTrackingEventRecord): Address | undefined {
  const city = record.NR_LocationCity__c
  const state = record.NR_LocationState__c
  const postalCode = record.NR_LocationPostalCode__c
  const country = record.NR_LocationCountry__c
  const street1 = record.NR_LocationStreet__c

  if (!city && !state && !postalCode && !country && !street1) return undefined

  return {
    street1: street1 ?? undefined,
    city: city ?? undefined,
    state: state ?? undefined,
    postalCode: postalCode ?? undefined,
    country: country ?? undefined,
  }
}

export function transformTrackingEvent(raw: NeuroredTrackingEventRecord): TrackingEvent {
  return {
    id: raw.Id,
    shipmentId: raw.NR_Shipment__c ?? undefined,
    trackingNumber: raw.NR_TrackingNumber__c ?? undefined,
    carrierId: 'neurored',
    status: mapTrackingStatus(raw.NR_Status__c),
    description: raw.NR_Description__c ?? undefined,
    location: toLocation(raw),
    occurredAt: toISODate(raw.NR_EventDate__c),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformTrackingEvents(records: NeuroredTrackingEventRecord[]): TrackingEvent[] {
  return records.map(transformTrackingEvent)
}
