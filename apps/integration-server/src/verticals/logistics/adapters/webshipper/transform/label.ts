import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Webshipper raw types ────────────────────────────────────────────────────

export interface WebshipperLabelAttributes {
  shipment_id?: string | number | null
  tracking_number?: string | null
  service_code?: string | null
  label_size?: string | null
  label_format?: string | null
  base64?: string | string[] | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface WebshipperLabel {
  id?: string | number | null
  type?: string
  attributes?: WebshipperLabelAttributes | null
  [key: string]: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapFormat(fmt: string | null | undefined): LabelFormat | undefined {
  if (!fmt) return undefined
  const t = fmt.toUpperCase()
  if (t.includes('PDF')) return 'PDF'
  if (t.includes('PNG') || t.includes('IMAGE')) return 'PNG'
  if (t.includes('ZPL')) return 'ZPL'
  if (t.includes('EPL')) return 'EPL2'
  return undefined
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformLabel(raw: WebshipperLabel): Label {
  const attrs = raw.attributes ?? {}

  // base64 may be an array (one entry per page/label); join or take first
  const base64Raw = attrs.base64
  const base64 = Array.isArray(base64Raw)
    ? base64Raw[0] ?? undefined
    : base64Raw ?? undefined

  return {
    id: String(raw.id ?? ''),
    shipmentId: attrs.shipment_id != null ? String(attrs.shipment_id) : undefined,
    trackingNumber: attrs.tracking_number ?? undefined,
    carrierId: 'webshipper',
    serviceCode: attrs.service_code ?? undefined,
    format: mapFormat(attrs.label_format),
    status: 'CREATED',
    base64: base64,
    createdAt: toISODate(attrs.created_at),
    updatedAt: toISODate(attrs.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
