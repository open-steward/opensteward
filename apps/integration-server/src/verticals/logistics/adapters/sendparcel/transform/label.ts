import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * SendParcel label object as returned by the API.
 */
export interface SendParcelLabel {
  id?: string | null
  shipmentId?: string | null
  trackingNumber?: string | null
  carrier?: string | null
  service?: string | null
  format?: string | null       // e.g. "pdf", "png", "zpl"
  url?: string | null
  base64?: string | null
  price?: number | null
  currency?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toLowerCase()
  if (f.includes('pdf')) return 'PDF'
  if (f.includes('png') || f.includes('image')) return 'PNG'
  if (f.includes('zpl')) return 'ZPL'
  if (f.includes('epl')) return 'EPL2'
  return undefined
}

export function transformLabel(raw: SendParcelLabel): Label {
  return {
    id: raw.id ?? undefined,
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service ?? undefined,
    format: mapLabelFormat(raw.format),
    status: 'CREATED',
    url: raw.url ?? undefined,
    base64: raw.base64 ?? undefined,
    cost:
      raw.price !== null && raw.price !== undefined
        ? {
            amount: raw.price,
            currency: raw.currency ?? 'EUR',
          }
        : undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
