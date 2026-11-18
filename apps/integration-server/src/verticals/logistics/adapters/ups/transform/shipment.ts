import type { Shipment } from '../../../schema/shipment'
import { parseDecimal } from '../../shared/transform'

export interface UPSShipmentResults {
  ShipmentIdentificationNumber?: string
  ShipmentCharges?: {
    TotalCharges?: {
      MonetaryValue?: string
      CurrencyCode?: string
    }
  }
  PackageResults?: Array<{
    TrackingNumber?: string
    ShippingLabel?: {
      GraphicImage?: string
      ImageFormat?: { Code?: string }
    }
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface UPSShipResponse {
  ShipmentResponse: {
    ShipmentResults: UPSShipmentResults
    [key: string]: unknown
  }
}

export function transformShipment(raw: UPSShipmentResults): Shipment {
  const firstPackage = raw.PackageResults?.[0]
  const totalCharges = raw.ShipmentCharges?.TotalCharges

  return {
    id: raw.ShipmentIdentificationNumber ?? undefined,
    status: 'LABEL_CREATED',
    trackingNumber: firstPackage?.TrackingNumber ?? raw.ShipmentIdentificationNumber ?? undefined,
    carrierId: 'UPS',
    cost: totalCharges
      ? {
          amount: parseDecimal(totalCharges.MonetaryValue) ?? 0,
          currency: totalCharges.CurrencyCode ?? 'USD',
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
