import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// POST /api_v3/shipping/manifest.json
// Generates a manifest PDF for one or more AWB numbers.
// Response: { status, status_code, file_name: "<PDF-URL>" }
export interface IthinkLogisticsManifestRaw {
  status?: string | null
  status_code?: number | null
  file_name?: string | null
  awb_numbers?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformManifest(
  raw: IthinkLogisticsManifestRaw,
  awbNumbers?: string[],
): Manifest {
  return {
    id: (awbNumbers ?? []).join(',') || '',
    carrierId: 'ithink-logistics',
    status: raw.status?.toLowerCase() === 'success' ? 'SUBMITTED' : 'UNKNOWN',
    shipmentIds: awbNumbers ?? undefined,
    labelCount: awbNumbers?.length,
    submittedAt: toISODate(raw.created_at),
    createdAt: toISODate(raw.created_at),
    metadata: { ...raw, file_name: raw.file_name } as Record<string, unknown>,
  }
}
