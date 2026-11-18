import type { Label, LabelFormat } from '../../../schema/label'
import type { MondialRelayShipment, MondialRelayLabel } from './shipment'

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
  entry: MondialRelayLabel,
  shipment: MondialRelayShipment,
  index: number,
): Label {
  return {
    id: `${shipment.shipment_id}-label-${index}`,
    shipmentId: shipment.shipment_id,
    trackingNumber: shipment.tracking_number ?? undefined,
    carrierId: 'mondialrelay',
    format: mapLabelFormat(entry.format) ?? 'PDF',
    status: 'CREATED',
    base64: entry.data ?? undefined,
    metadata: { ...shipment, _labelEntry: entry } as Record<string, unknown>,
  }
}

/**
 * Build all label variants from a Mondial Relay shipment response.
 */
export function transformLabels(shipment: MondialRelayShipment): Label[] {
  if (!shipment.labels || shipment.labels.length === 0) return []
  return shipment.labels.map((entry, index) => transformLabel(entry, shipment, index))
}
