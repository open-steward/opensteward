import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

/**
 * iMile label object.
 * iMile returns labels either as a hosted URL (PDF) or as a base64-encoded
 * string depending on the endpoint and merchant configuration.
 */
export interface IMileLabel {
  /** iMile waybill / tracking number. */
  waybillNo?: string | null
  /** Merchant order reference. */
  orderNo?: string | null
  /** Hosted URL for the PDF label. */
  labelUrl?: string | null
  /** Base64-encoded label content (alternative delivery mode). */
  labelBase64?: string | null
  /** Format hint: "PDF", "ZPL", etc. */
  labelFormat?: string | null
  createdTime?: string | null
  [key: string]: unknown
}

function mapLabelFormat(fmt: string | null | undefined): LabelFormat | undefined {
  if (!fmt) return undefined
  const f = fmt.toUpperCase()
  if (f.includes('PDF')) return 'PDF'
  if (f.includes('ZPL')) return 'ZPL'
  if (f.includes('PNG') || f.includes('IMAGE')) return 'PNG'
  if (f.includes('EPL')) return 'EPL2'
  return undefined
}

export function transformLabel(raw: IMileLabel): Label {
  return {
    id: raw.waybillNo ?? undefined,
    shipmentId: raw.waybillNo ?? undefined,
    trackingNumber: raw.waybillNo ?? undefined,
    carrierId: 'imile',
    serviceCode: undefined,
    format: mapLabelFormat(raw.labelFormat) ?? 'PDF',
    status: 'CREATED',
    url: raw.labelUrl ?? undefined,
    base64: raw.labelBase64 ?? undefined,
    createdAt: toISODate(raw.createdTime),
    metadata: raw as Record<string, unknown>,
  }
}
