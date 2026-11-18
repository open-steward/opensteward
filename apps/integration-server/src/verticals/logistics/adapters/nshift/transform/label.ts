import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── nShift raw types ────────────────────────────────────────────────────────

export interface NShiftLabel {
  id?: string | null
  shipmentId?: string | null
  parcelNo?: string | null
  serviceId?: string | null
  format?: string | null
  href?: string | null
  description?: string | null
  pdf?: string | null
  created?: string | null
  updated?: string | null
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

export function transformLabel(raw: NShiftLabel): Label {
  return {
    id: raw.id ?? raw.parcelNo ?? undefined,
    shipmentId: raw.shipmentId ?? undefined,
    trackingNumber: raw.parcelNo ?? undefined,
    carrierId: 'nshift',
    serviceCode: raw.serviceId ?? undefined,
    format: mapFormat(raw.format ?? (raw.href?.endsWith('.zpl') ? 'ZPL' : 'PDF')),
    status: 'CREATED',
    url: raw.href ?? undefined,
    base64: raw.pdf ?? undefined,
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.updated),
    metadata: raw as Record<string, unknown>,
  }
}
