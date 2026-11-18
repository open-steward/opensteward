import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { FedExTransactionShipment } from './shipment'

function mapLabelFormat(format: string | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toUpperCase()
  if (f === 'PDF') return 'PDF'
  if (f === 'PNG') return 'PNG'
  if (f === 'ZPL') return 'ZPL'
  return undefined
}

export function transformLabel(raw: FedExTransactionShipment): Label {
  const firstPiece = raw.pieceResponses?.[0]
  const labelDoc = firstPiece?.packageDocuments?.[0]

  return {
    id: raw.masterTrackingNumber,
    shipmentId: raw.masterTrackingNumber,
    trackingNumber: firstPiece?.trackingNumber ?? raw.masterTrackingNumber ?? undefined,
    carrierId: 'fedex',
    serviceCode: raw.serviceType ?? undefined,
    format: mapLabelFormat(labelDoc?.documentFormat),
    status: 'CREATED',
    base64: labelDoc?.document ?? undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
