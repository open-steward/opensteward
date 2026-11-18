import type { Label, LabelFormat } from '../../../schema/label'
import type { SendleLabelEntry, SendleOrder } from './shipment'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toLowerCase()
  if (f.includes('pdf')) return 'PDF'
  if (f.includes('png') || f.includes('image')) return 'PNG'
  if (f.includes('zpl')) return 'ZPL'
  return undefined
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformLabel(
  entry: SendleLabelEntry,
  order: SendleOrder,
): Label {
  return {
    id: `${order.order_id}-${entry.size}-${entry.format}`,
    shipmentId: order.order_id,
    trackingNumber: order.sendle_reference ?? undefined,
    carrierId: 'sendle',
    format: mapLabelFormat(entry.format),
    status: 'CREATED',
    url: entry.url ?? undefined,
    metadata: { ...order, _labelEntry: entry } as Record<string, unknown>,
  }
}

/**
 * Build all label variants from a Sendle order response.
 */
export function transformLabels(order: SendleOrder): Label[] {
  if (!order.labels || order.labels.length === 0) return []
  return order.labels.map((entry) => transformLabel(entry, order))
}
