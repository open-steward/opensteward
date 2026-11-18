import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Endicia raw types ─────────────────────────────────────────────────────

export interface EndiciaLabel {
  label_id: string
  tracking_number: string | null
  service_code: string | null
  format: string | null
  status: string | null
  url: string | null
  base64: string | null
  created_at: string | null
  [key: string]: unknown
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toLowerCase()
  if (f.includes('pdf')) return 'PDF'
  if (f.includes('png') || f.includes('image')) return 'PNG'
  if (f.includes('zpl')) return 'ZPL'
  return undefined
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: EndiciaLabel): Label {
  return {
    id: raw.label_id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'endicia',
    serviceCode: raw.service_code ?? undefined,
    format: mapLabelFormat(raw.format) ?? 'PDF',
    status: 'CREATED',
    url: raw.url ?? undefined,
    base64: raw.base64 ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
