import type { Label, LabelFormat } from '../../../schema/label'

export interface USPSLabelMetadata {
  trackingNumber: string
  postage: number
  zone: string
  weightUOM: string
  weight: number
  dimensionalWeight: number
  bannerText: string | null
  serviceTypeCode: string | null
  SKU: string | null
  commitment: {
    name: string | null
    scheduleDeliveryDate: string | null
  } | null
  fees: unknown[]
  extraServices: unknown[]
  links: unknown[]
  [key: string]: unknown
}

function mapImageType(imageType: string): LabelFormat | undefined {
  const t = imageType.toUpperCase()
  if (t === 'PDF') return 'PDF'
  if (t.startsWith('ZPL')) return 'ZPL'
  if (t === 'PNG' || t === 'JPG') return 'PNG'
  return undefined
}

export function transformLabel(
  raw: USPSLabelMetadata,
  imageType: string,
  labelBase64?: string,
): Label {
  return {
    id: raw.trackingNumber,
    trackingNumber: raw.trackingNumber || undefined,
    carrierId: 'usps',
    serviceCode: raw.SKU ?? undefined,
    format: mapImageType(imageType),
    status: 'CREATED',
    base64: labelBase64,
    cost: raw.postage != null
      ? { amount: raw.postage, currency: 'USD' }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
