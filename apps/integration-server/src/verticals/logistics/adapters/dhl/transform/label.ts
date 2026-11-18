import type { Label, LabelFormat } from '../../../schema/label'
import { parseDecimal } from '../../shared/transform'
import type { DHLDocument, DHLShipmentResponse, DHLShipmentCharge } from './shipment'
export type { DHLDocument } from './shipment'

function mapLabelFormat(imageFormat: string | null | undefined): LabelFormat | undefined {
  if (!imageFormat) return undefined
  const f = imageFormat.toUpperCase()
  if (f === 'PDF') return 'PDF'
  if (f === 'ZPL') return 'ZPL'
  if (f === 'PNG') return 'PNG'
  if (f === 'EPL2') return 'EPL2'
  return undefined
}

/**
 * Extract the billing-currency charge (currencyType === "BILLC").
 * Falls back to the first entry.
 */
function billingCharge(charges: DHLShipmentCharge[]): DHLShipmentCharge | undefined {
  return charges.find((c) => c.currencyType === 'BILLC') ?? charges[0]
}

/**
 * Transform a single DHL document into a canonical Label.
 */
export function transformLabel(
  doc: DHLDocument,
  shipment: DHLShipmentResponse,
): Label {
  const charge = billingCharge(shipment.shipmentCharges ?? [])

  return {
    id: `${shipment.shipmentTrackingNumber}-${doc.typeCode}-${doc.imageFormat}`.toLowerCase(),
    shipmentId: shipment.shipmentTrackingNumber ?? undefined,
    trackingNumber: shipment.shipmentTrackingNumber ?? undefined,
    carrierId: 'dhl',
    format: mapLabelFormat(doc.imageFormat),
    status: 'CREATED',
    base64: doc.content ?? undefined,
    cost: charge
      ? {
          amount: parseDecimal(charge.price) ?? 0,
          currency: charge.priceCurrency ?? 'USD',
        }
      : undefined,
    metadata: { ...shipment, _document: doc } as Record<string, unknown>,
  }
}

/**
 * Transform all label documents from a DHL shipment response.
 */
export function transformLabels(shipment: DHLShipmentResponse): Label[] {
  const docs = (shipment.documents ?? []).filter((d) => d.typeCode === 'label')
  return docs.map((doc) => transformLabel(doc, shipment))
}
