import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { ReturnGoRma } from './rma'

/**
 * Map a ReturnGO shipment status to a canonical LabelStatus.
 * ReturnGO does not distinguish voided/refunded labels — all generated
 * labels are treated as CREATED unless the RMA is cancelled.
 */
function mapToLabelStatus(status: string | null | undefined): LabelStatus {
  if (!status) return 'CREATED'
  const s = status.toLowerCase()
  if (s.includes('cancel') || s.includes('void')) return 'VOIDED'
  if (
    s.includes('used') ||
    s.includes('received') ||
    s.includes('delivered') ||
    s.includes('complete')
  )
    return 'USED'
  return 'CREATED'
}

/**
 * Derive a canonical Label from a ReturnGO RMA.
 *
 * ReturnGO does not expose a dedicated /labels endpoint. Label information
 * (url, cost, carrier, tracking number, service) is embedded within each
 * RMA's `shipment` sub-object and at the top level of the RMA record.
 * Only RMAs that have a label_url are yielded as Labels.
 */
export function transformRmaToLabel(raw: ReturnGoRma): Label | undefined {
  const labelUrl = raw.label_url ?? raw.shipment?.label_url
  if (!labelUrl) return undefined

  const labelCost = raw.shipment?.label_cost ?? undefined
  const carrier = raw.carrier ?? raw.shipment?.carrier ?? undefined
  const trackingNumber = raw.tracking_number ?? raw.shipment?.tracking_number ?? undefined
  const serviceCode = raw.shipment?.service ?? undefined
  const shipmentStatus = raw.shipment?.status ?? raw.return_status ?? raw.status

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    shipmentId: raw.id != null ? String(raw.id) : undefined,
    trackingNumber: trackingNumber ?? undefined,
    carrierId: carrier ?? undefined,
    serviceCode: serviceCode ?? undefined,
    format: undefined, // ReturnGO does not surface label format in the API
    status: mapToLabelStatus(shipmentStatus),
    url: labelUrl,
    cost:
      labelCost != null && raw.currency
        ? { amount: Math.round(labelCost * 100), currency: raw.currency }
        : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
