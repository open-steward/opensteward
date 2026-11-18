import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { BpostShipmentResponse } from './shipment'

function mapLabelFormat(format: string | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toUpperCase()
  if (f === 'PDF') return 'PDF'
  if (f === 'PNG') return 'PNG'
  if (f === 'ZPL') return 'ZPL'
  return undefined
}

export function transformLabel(raw: BpostShipmentResponse): Label {
  return {
    id: raw.shipmentId,
    shipmentId: raw.shipmentId,
    trackingNumber: raw.barcode ?? undefined,
    carrierId: 'bpost',
    serviceCode: raw.serviceCode ?? undefined,
    format: mapLabelFormat('PDF'),
    status: 'CREATED',
    base64: raw.labelData ?? undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
