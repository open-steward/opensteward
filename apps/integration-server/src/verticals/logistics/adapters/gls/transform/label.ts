import type { Label, LabelFormat } from '../../../schema/label'
import type { GlsShipment, GlsLabel } from './shipment'

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
  entry: GlsLabel,
  shipment: GlsShipment,
  index: number,
): Label {
  return {
    id: `${shipment.shipmentId}-label-${index}`,
    shipmentId: shipment.shipmentId,
    trackingNumber: shipment.parcels?.[0]?.trackId ?? undefined,
    carrierId: 'gls',
    format: mapLabelFormat(entry.format) ?? 'PDF',
    status: 'CREATED',
    base64: entry.data ?? undefined,
    metadata: { ...shipment, _labelEntry: entry } as Record<string, unknown>,
  }
}

/**
 * Build all label variants from a GLS shipment response.
 * GLS returns labels as base64 PDF in the labels[].data field.
 */
export function transformLabels(shipment: GlsShipment): Label[] {
  if (!shipment.labels || shipment.labels.length === 0) return []
  return shipment.labels.map((entry, index) => transformLabel(entry, shipment, index))
}
