import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

export interface DeutschePostLabelResponse {
  shipmentId: string
  trackingNumber?: string
  product?: string
  labelData?: string
  labelFormat?: string
  [key: string]: unknown
}

function mapLabelFormat(format: string | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toUpperCase()
  if (f === 'PDF') return 'PDF'
  if (f === 'PNG') return 'PNG'
  if (f === 'ZPL') return 'ZPL'
  return undefined
}

export function transformLabel(raw: DeutschePostLabelResponse): Label {
  return {
    id: raw.shipmentId,
    shipmentId: raw.shipmentId,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'deutschepost',
    serviceCode: raw.product ?? undefined,
    format: mapLabelFormat(raw.labelFormat),
    status: 'CREATED',
    base64: raw.labelData ?? undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
