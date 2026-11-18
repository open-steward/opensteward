import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate, parseDecimal } from '../../shared/transform'

export interface StarshipitLabel {
  order_id?: string | number | null
  order_number?: string | null
  tracking_number?: string | null
  carrier_name?: string | null
  carrier_code?: string | null
  service_name?: string | null
  service_code?: string | null
  label_url?: string | null
  label_format?: string | null    // "pdf", "png", "zpl"
  label_data?: string | null      // base64-encoded label content
  status?: string | null
  shipping_price?: number | null
  currency?: string | null
  created_date?: string | null
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

function mapLabelStatus(status: string | null | undefined): Label['status'] {
  switch ((status ?? '').toLowerCase()) {
    case 'created':
    case 'printed':
    case 'ready':
      return 'CREATED'
    case 'used':
    case 'shipped':
      return 'USED'
    case 'refunded':
      return 'REFUNDED'
    case 'voided':
    case 'cancelled':
      return 'VOIDED'
    default:
      return 'CREATED'
  }
}

export function transformLabel(raw: StarshipitLabel): Label {
  return {
    id: raw.order_id != null ? String(raw.order_id) : undefined,
    shipmentId: raw.order_id != null ? String(raw.order_id) : undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier_code ?? raw.carrier_name ?? undefined,
    serviceCode: raw.service_code ?? raw.service_name ?? undefined,
    format: mapLabelFormat(raw.label_format),
    status: mapLabelStatus(raw.status),
    url: raw.label_url ?? undefined,
    base64: raw.label_data ?? undefined,
    cost:
      raw.shipping_price != null
        ? {
            amount: parseDecimal(raw.shipping_price) ?? 0,
            currency: raw.currency ?? 'AUD',
          }
        : undefined,
    createdAt: toISODate(raw.created_date),
    metadata: raw as Record<string, unknown>,
  }
}
