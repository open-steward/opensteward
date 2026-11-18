import type { Label, LabelFormat } from '../../../schema/label'
import type { DpdUkShipmentResponse, DpdUkLabel } from './shipment'

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
  entry: DpdUkLabel,
  shipment: DpdUkShipmentResponse,
  index: number,
): Label {
  return {
    id: `${shipment.shipmentId ?? shipment.consignmentNumber ?? ''}-label-${index}`,
    shipmentId: shipment.shipmentId ?? undefined,
    trackingNumber: shipment.consignmentNumber ?? undefined,
    carrierId: 'dpd-uk',
    format: mapLabelFormat(entry.format) ?? 'PDF',
    status: 'CREATED',
    base64: entry.data ?? undefined,
    metadata: { ...shipment, _labelEntry: entry } as Record<string, unknown>,
  }
}

/**
 * Build all label variants from a DPD-UK shipment response.
 * DPD-UK returns labels as base64 PDF in the labels[].data field.
 */
export function transformLabels(shipment: DpdUkShipmentResponse): Label[] {
  if (!shipment.labels || shipment.labels.length === 0) return []
  return shipment.labels.map((entry, index) => transformLabel(entry, shipment, index))
}
