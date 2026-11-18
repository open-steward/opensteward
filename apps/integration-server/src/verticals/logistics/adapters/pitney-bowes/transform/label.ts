import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { PitneyBowesShipmentResponse } from './shipment'

function mapLabelFormat(format: string | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toUpperCase()
  if (f === 'PDF') return 'PDF'
  if (f === 'PNG') return 'PNG'
  if (f === 'ZPL' || f === 'ZPL2') return 'ZPL'
  return undefined
}

export function transformLabel(raw: PitneyBowesShipmentResponse): Label {
  const labelDoc = raw.documents?.find((d) => d.type === 'SHIPPING_LABEL')

  return {
    id: raw.shipmentId,
    shipmentId: raw.shipmentId,
    trackingNumber: raw.parcelTrackingNumber ?? undefined,
    carrierId: 'pitney-bowes',
    serviceCode: raw.rates?.[0]?.serviceId ?? undefined,
    format: mapLabelFormat(labelDoc?.contentType),
    status: 'CREATED',
    base64: labelDoc?.contents ?? undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
