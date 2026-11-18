import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { BlueDartShipment } from './shipment'

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapLabelStatus(status: string | null): LabelStatus {
  switch (status) {
    case 'CANCELLED': return 'VOIDED'
    case 'DELIVERED': return 'USED'
    default:          return 'CREATED'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * Derive a Label from the BlueDart shipment/waybill response.
 * BlueDart does not expose a dedicated /labels endpoint; the waybill
 * (GenerateWayBill) response contains the label URL alongside AWB metadata.
 */
export function transformLabel(raw: BlueDartShipment): Label {
  return {
    id: raw.waybill_number,
    shipmentId: raw.waybill_number,
    trackingNumber: raw.waybill_number ?? undefined,
    carrierId: 'bluedart',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: mapLabelStatus(raw.status),
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
