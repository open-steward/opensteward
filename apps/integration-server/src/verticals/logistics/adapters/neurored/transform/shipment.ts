import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toAddress, toWeight } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP } from '../constants'

/**
 * Raw Salesforce record shape for the NR_Shipment__c custom object.
 */
export interface NeuroredShipmentRecord {
  Id: string
  Name?: string
  NR_TrackingNumber__c?: string
  NR_Status__c?: string
  NR_ServiceType__c?: string
  NR_CarrierName__c?: string
  NR_Mode__c?: string
  NR_TotalWeight__c?: number
  NR_WeightUnit__c?: string
  NR_EstimatedDelivery__c?: string
  NR_ActualDelivery__c?: string
  NR_LabelUrl__c?: string
  NR_Reference__c?: string
  NR_Notes__c?: string
  // Origin address fields
  NR_OriginName__c?: string
  NR_OriginCompany__c?: string
  NR_OriginStreet__c?: string
  NR_OriginCity__c?: string
  NR_OriginState__c?: string
  NR_OriginPostalCode__c?: string
  NR_OriginCountry__c?: string
  NR_OriginPhone__c?: string
  NR_OriginEmail__c?: string
  // Destination address fields
  NR_DestName__c?: string
  NR_DestCompany__c?: string
  NR_DestStreet__c?: string
  NR_DestCity__c?: string
  NR_DestState__c?: string
  NR_DestPostalCode__c?: string
  NR_DestCountry__c?: string
  NR_DestPhone__c?: string
  NR_DestEmail__c?: string
  // Salesforce system fields
  CreatedDate?: string
  LastModifiedDate?: string
  [key: string]: unknown
}

function mapShipmentStatus(code: string | undefined): ShipmentStatus {
  if (!code) return 'UNKNOWN'
  return (SHIPMENT_STATUS_MAP[code] as ShipmentStatus) ?? 'UNKNOWN'
}

export function transformShipment(raw: NeuroredShipmentRecord): Shipment {
  const originAddress = toAddress({
    name: raw.NR_OriginName__c,
    company: raw.NR_OriginCompany__c,
    street1: raw.NR_OriginStreet__c,
    city: raw.NR_OriginCity__c,
    state: raw.NR_OriginState__c,
    postalCode: raw.NR_OriginPostalCode__c,
    country: raw.NR_OriginCountry__c,
    phone: raw.NR_OriginPhone__c,
    email: raw.NR_OriginEmail__c,
  })

  const destinationAddress = toAddress({
    name: raw.NR_DestName__c,
    company: raw.NR_DestCompany__c,
    street1: raw.NR_DestStreet__c,
    city: raw.NR_DestCity__c,
    state: raw.NR_DestState__c,
    postalCode: raw.NR_DestPostalCode__c,
    country: raw.NR_DestCountry__c,
    phone: raw.NR_DestPhone__c,
    email: raw.NR_DestEmail__c,
  })

  const weightUnit = (() => {
    const u = (raw.NR_WeightUnit__c ?? '').toLowerCase()
    if (u === 'kg') return 'kg' as const
    if (u === 'g') return 'g' as const
    if (u === 'lb' || u === 'lbs') return 'lb' as const
    return 'lb' as const
  })()

  return {
    id: raw.Id,
    status: mapShipmentStatus(raw.NR_Status__c),
    trackingNumber: raw.NR_TrackingNumber__c ?? undefined,
    carrierId: raw.NR_CarrierName__c ?? 'neurored',
    serviceCode: raw.NR_ServiceType__c ?? undefined,
    originAddress,
    destinationAddress,
    totalWeight: toWeight(raw.NR_TotalWeight__c, weightUnit),
    estimatedDeliveryAt: toISODate(raw.NR_EstimatedDelivery__c),
    actualDeliveryAt: toISODate(raw.NR_ActualDelivery__c),
    labelUrl: raw.NR_LabelUrl__c ?? undefined,
    reference: raw.NR_Reference__c ?? undefined,
    notes: raw.NR_Notes__c ?? undefined,
    createdAt: toISODate(raw.CreatedDate),
    updatedAt: toISODate(raw.LastModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
