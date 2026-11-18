import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { KarrioShipment } from './shipment'

/** Shipment.label_type, documented enum: PDF, ZPL, PNG, '' or null. */
function mapLabelFormat(labelType: string | null | undefined): LabelFormat | undefined {
  if (labelType === 'PDF' || labelType === 'PNG' || labelType === 'ZPL') return labelType
  return undefined
}

/**
 * A Karrio label is the label on a shipment: Shipment.label_url "The shipment
 * label URL" and label_type "The shipment label file type."
 */
export function transformLabel(raw: KarrioShipment): Label {
  const url = raw.label_url && URL.canParse(raw.label_url) ? raw.label_url : undefined
  return {
    id: raw.id,
    shipmentId: raw.id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier_id ?? undefined,
    serviceCode: raw.service ?? undefined,
    format: mapLabelFormat(raw.label_type),
    status: url ? 'CREATED' : undefined,
    url,
    createdAt: toISODate(raw.created_at),
  }
}
