import type { Label } from '../../../schema/label'

export interface DhlParcelBnlLabel {
  labelId: string
  labelType: string | null
  trackerCode: string | null
  routingCode: string | null
  userId: string | null
  organizationId: string | null
  orderReference: string | null
  pdf: string | null
  [key: string]: unknown
}

export function transformLabel(raw: DhlParcelBnlLabel): Label {
  return {
    id: raw.labelId,
    shipmentId: undefined,
    trackingNumber: raw.trackerCode ?? undefined,
    carrierId: 'dhl-parcel-bnl',
    serviceCode: raw.labelType ?? undefined,
    format: 'PDF',
    status: raw.pdf != null ? 'CREATED' : undefined,
    url: undefined,
    base64: raw.pdf ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
