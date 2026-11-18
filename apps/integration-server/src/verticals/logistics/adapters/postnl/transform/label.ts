import type { Label, LabelFormat } from '../../../schema/label'
import type { PostNLLabel, PostNLResponseShipment } from './shipment'

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapLabelFormat(outputType: string | null | undefined): LabelFormat | undefined {
  if (!outputType) return undefined
  const f = outputType.toLowerCase()
  if (f.includes('pdf')) return 'PDF'
  if (f.includes('png') || f.includes('image')) return 'PNG'
  if (f.includes('zpl')) return 'ZPL'
  return undefined
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(
  entry: PostNLLabel,
  shipment: PostNLResponseShipment,
): Label {
  return {
    id: `${shipment.Barcode}-${entry.Labeltype}`,
    shipmentId: shipment.Barcode,
    trackingNumber: shipment.Barcode ?? undefined,
    carrierId: 'postnl',
    format: mapLabelFormat(entry.OutputType),
    status: 'CREATED',
    base64: entry.Content ?? undefined,
    metadata: { ...shipment, _labelEntry: entry } as Record<string, unknown>,
  }
}

export function transformLabels(shipment: PostNLResponseShipment): Label[] {
  if (!shipment.Labels || shipment.Labels.length === 0) return []
  return shipment.Labels.map((entry) => transformLabel(entry, shipment))
}
