import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

export interface InnoshipManifest {
  manifestId?: string | number | null
  carrierId?: number | null
  courierName?: string | null
  awbs?: string[] | null
  status?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

export function transformManifest(raw: InnoshipManifest): Manifest {
  return {
    id: raw.manifestId != null ? String(raw.manifestId) : undefined,
    carrierId: raw.carrierId != null ? String(raw.carrierId) : undefined,
    shipmentIds: (raw.awbs ?? []).length > 0 ? (raw.awbs as string[]) : undefined,
    status: 'SUBMITTED',
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
