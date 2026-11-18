import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Melhor Envio raw types ───────────────────────────────────────────────────

/**
 * Shape returned when generating / printing a label via
 * POST /api/v2/me/shipment/generate and GET /api/v2/me/shipment/print.
 */
export interface MelhorEnvioLabel {
  id?: string | number | null
  protocol?: string | null
  /** Cart item ID that the label belongs to. */
  cart_id?: string | number | null
  tracking?: string | null
  status?: string | null
  service_id?: number | null
  service_code?: string | null
  company?: {
    id?: number | null
    name?: string | null
    [key: string]: unknown
  } | null
  /** URL to the generated label PDF or ZPL. */
  url?: string | null
  /** May be present when the API returns the raw print payload. */
  tag?: string | null
  format?: string | null
  created_at?: string | null
  updated_at?: string | null
  generated_at?: string | null
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

export function transformLabel(raw: MelhorEnvioLabel): Label {
  const id = raw.id != null ? String(raw.id) : undefined

  const carrierId = raw.company?.name
    ? String(raw.company.name).toLowerCase().replace(/\s+/g, '-')
    : 'melhor-envio'

  return {
    id,
    shipmentId: raw.cart_id != null ? String(raw.cart_id) : undefined,
    trackingNumber: raw.tracking ?? undefined,
    carrierId,
    serviceCode:
      raw.service_code ?? (raw.service_id != null ? String(raw.service_id) : undefined),
    format: mapFormat(raw.format) ?? 'PDF',
    status: 'CREATED',
    url: raw.url ?? undefined,
    base64: undefined,
    createdAt: toISODate(raw.created_at ?? raw.generated_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
