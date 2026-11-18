import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ── PPL CZ raw label types ────────────────────────────────────────────────

export interface PplCzLabel {
  shipmentNumber?: string | null
  referenceId?: string | null
  productType?: string | null
  /** Format returned: "Pdf" | "Zpl" | "Png" | "Epl" */
  format?: string | null
  /** URL from which the label PDF/image can be downloaded */
  labelUrl?: string | null
  /** Base64-encoded label content (when URL is not available) */
  labelContent?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

// ── Format mapping ────────────────────────────────────────────────────────

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toLowerCase()
  if (f === 'pdf') return 'PDF'
  if (f === 'zpl') return 'ZPL'
  if (f === 'png') return 'PNG'
  if (f === 'epl' || f === 'epl2') return 'EPL2'
  return undefined
}

// ── Label transform ───────────────────────────────────────────────────────

export function transformLabel(raw: PplCzLabel): Label {
  return {
    id: raw.shipmentNumber ?? undefined,
    shipmentId: raw.shipmentNumber ?? undefined,
    trackingNumber: raw.shipmentNumber ?? undefined,
    carrierId: 'ppl-cz',
    serviceCode: raw.productType ?? undefined,
    format: mapLabelFormat(raw.format),
    status: 'CREATED',
    url: raw.labelUrl ?? undefined,
    base64: raw.labelContent ?? undefined,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Build a minimal Label from a batch response shipment entry.
 * Used when the batch returns shipmentNumber + batchId for label download.
 */
export function labelFromShipmentEntry(
  shipmentNumber: string,
  referenceId: string | undefined,
  productType: string | undefined,
  labelUrl: string | undefined,
): Label {
  return {
    id: shipmentNumber,
    shipmentId: shipmentNumber,
    trackingNumber: shipmentNumber,
    carrierId: 'ppl-cz',
    serviceCode: productType,
    status: 'CREATED',
    url: labelUrl,
    metadata: { shipmentNumber, referenceId, productType, labelUrl } as Record<string, unknown>,
  }
}
