import type { Shipment } from '../../../schema/shipment'
import { parseDecimal } from '../../shared/transform'

export interface DHLShipmentCharge {
  currencyType: string   // "BILLC" | "PULCL" | "BASEC"
  priceCurrency: string
  price: number
}

export interface DHLShipmentPackage {
  trackingNumber: string | null
  referenceNumber: string | null
  volumetricWeight: number | null
}

export interface DHLDocument {
  imageFormat: string      // "PDF" | "ZPL"
  content: string          // base64
  typeCode: string         // "label" | "waybillDoc" | "invoice"
}

export interface DHLShipmentResponse {
  shipmentTrackingNumber: string
  trackingUrl: string | null
  packages: DHLShipmentPackage[]
  documents: DHLDocument[]
  shipmentCharges: DHLShipmentCharge[]
  [key: string]: unknown
}

/**
 * Extract the billing-currency charge (currencyType === "BILLC").
 * Falls back to the first entry.
 */
function billingCharge(charges: DHLShipmentCharge[]): DHLShipmentCharge | undefined {
  return charges.find((c) => c.currencyType === 'BILLC') ?? charges[0]
}

export function transformShipment(raw: DHLShipmentResponse): Shipment {
  const charge = billingCharge(raw.shipmentCharges ?? [])
  return {
    id: raw.shipmentTrackingNumber,
    status: 'LABEL_CREATED',
    trackingNumber: raw.shipmentTrackingNumber ?? undefined,
    carrierId: 'dhl',
    labelUrl: raw.trackingUrl ?? undefined,
    packages: (raw.packages ?? []).map((pkg) => ({
      trackingNumber: pkg.trackingNumber ?? undefined,
      reference: pkg.referenceNumber ?? undefined,
    })),
    cost: charge
      ? {
          amount: parseDecimal(charge.price) ?? 0,
          currency: charge.priceCurrency ?? 'USD',
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
