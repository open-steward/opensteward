import type { Label, LabelFormat } from '../../../schema/label'
import type { DpdDeShipmentResponse, DpdDeLabel } from './shipment'

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

export function transformLabel(
  entry: DpdDeLabel,
  shipment: DpdDeShipmentResponse,
  index: number,
): Label {
  return {
    id: `${shipment.shipmentId ?? shipment.consignmentNumber ?? ''}-label-${index}`,
    shipmentId: shipment.shipmentId ?? undefined,
    trackingNumber: shipment.consignmentNumber ?? undefined,
    carrierId: 'dpd-de',
    format: mapLabelFormat(entry.format) ?? 'PDF',
    status: 'CREATED',
    base64: entry.data ?? undefined,
    metadata: { ...shipment, _labelEntry: entry } as Record<string, unknown>,
  }
}

/**
 * Build all label variants from a DPD-DE shipment response.
 * DPD-DE returns labels as base64 PDF in the labels[].data field.
 */
export function transformLabels(shipment: DpdDeShipmentResponse): Label[] {
  if (!shipment.labels || shipment.labels.length === 0) return []
  return shipment.labels.map((entry, index) => transformLabel(entry, shipment, index))
}
