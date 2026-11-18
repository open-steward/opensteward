import type { Label } from '../../../schema/label'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * Label/guide object returned by POST /ship/generate.
 * Envia calls a created label a "guide" (guía).
 */
export interface EnviaGuide {
  carrier?: string | null
  service?: string | null
  trackingNumber?: string | null
  label?: string | null // Base64-encoded label content
  labelUrl?: string | null // URL to hosted label PDF
  labelFormat?: string | null
  totalPrice?: number | string | null
  currency?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

/**
 * Wrapper returned by POST /ship/generate — the guide is nested under "data".
 */
export interface EnviaGenerateResponse {
  data?: EnviaGuide | null
  meta?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformLabel(raw: EnviaGuide, shipmentId?: string): Label {
  const rawCostDecimal = parseDecimal(raw.totalPrice)
  const cost =
    rawCostDecimal != null && raw.currency
      ? {
          amount: Math.round(rawCostDecimal * 100),
          currency: raw.currency,
        }
      : undefined

  return {
    shipmentId,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service ?? undefined,
    format: mapLabelFormat(raw.labelFormat),
    status: 'CREATED',
    url: raw.labelUrl ?? undefined,
    base64: raw.label ?? undefined,
    cost,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}

function mapLabelFormat(fmt: string | null | undefined): Label['format'] {
  if (!fmt) return undefined
  const f = fmt.toUpperCase()
  if (f.includes('PDF')) return 'PDF'
  if (f.includes('PNG') || f.includes('IMAGE')) return 'PNG'
  if (f.includes('ZPL')) return 'ZPL'
  return undefined
}
