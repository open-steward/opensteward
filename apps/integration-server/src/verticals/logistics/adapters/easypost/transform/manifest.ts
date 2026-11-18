import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface EasyPostAddress {
  id?: string
  name?: string | null
  company?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface EasyPostScanForm {
  id: string
  object: 'ScanForm'
  status: string          // "creating" | "created" | "failed"
  message: string | null
  address: EasyPostAddress | null
  tracking_codes: string[]
  form_url: string | null
  form_file_type: string | null
  batch_id: string | null
  confirmation: string | null
  created_at: string
  updated_at: string
  [key: string]: unknown
}

function mapManifestStatus(status: string): ManifestStatus {
  switch (status) {
    case 'creating': return 'OPEN'
    case 'created':  return 'SUBMITTED'
    case 'failed':   return 'OPEN'
    default:         return 'OPEN'
  }
}

export function transformScanForm(raw: EasyPostScanForm): Manifest {
  return {
    id: raw.id,
    manifestNumber: raw.id,
    status: mapManifestStatus(raw.status),
    shipmentIds: undefined,             // tracking_codes are not shipment IDs
    labelCount: raw.tracking_codes?.length ?? undefined,
    submittedAt: raw.status === 'created' ? toISODate(raw.created_at) : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
