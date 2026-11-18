import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// AfterShip Shipping API (Postmen v3) — GET /labels, GET /labels/:id
// Docs: https://www.aftership.com/docs/shipping/model/resource/label
// Status values: creating | created | cancelling | cancelled | manifesting | manifested | failed

export interface AfterShipLabelFile {
  url: string | null
  file_type: string | null
  paper_size: string | null
}

export interface AfterShipLabelFiles {
  label: AfterShipLabelFile | null
  qr_code?: AfterShipLabelFile | null
  invoice?: AfterShipLabelFile | null
  customs_declaration?: AfterShipLabelFile | null
  packing_slip?: AfterShipLabelFile | null
  manifest?: AfterShipLabelFile | null
}

export interface AfterShipShipperAccount {
  id: string
  slug: string | null
  description: string | null
}

export interface AfterShipTotalCharge {
  amount: number
  currency: string
}

export interface AfterShipLabel {
  id: string
  status: string
  tracking_numbers: string[] | null
  files: AfterShipLabelFiles | null
  shipper_account: AfterShipShipperAccount | null
  service_type: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

function mapLabelStatus(status: string): LabelStatus {
  switch (status) {
    case 'created':
    case 'creating':
      return 'CREATED'
    case 'manifesting':
    case 'manifested':
      return 'USED'
    case 'cancelling':
    case 'cancelled':
      return 'VOIDED'
    case 'failed':
      return 'VOIDED'
    default:
      return 'CREATED'
  }
}

export function transformLabel(raw: AfterShipLabel): Label {
  const trackingNumber = (raw.tracking_numbers ?? [])[0]
  const labelUrl = raw.files?.label?.url ?? undefined
  const fileType = raw.files?.label?.file_type?.toUpperCase()

  return {
    id: raw.id,
    carrierId: raw.shipper_account?.slug ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    trackingNumber: trackingNumber ?? undefined,
    status: mapLabelStatus(raw.status),
    format: fileType === 'PDF' ? 'PDF' : fileType === 'PNG' ? 'PNG' : fileType === 'ZPL' ? 'ZPL' : fileType === 'EPL2' ? 'EPL2' : undefined,
    url: labelUrl ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
