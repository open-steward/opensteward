import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// Xpressbees manifest (pickup manifest) response
// POST shipments2/manifests
// Request: { awb_numbers: string[] }
// Response: { response: true, message: string, data: { link: string } }

export interface XpressbeesManifestRaw {
  response?: boolean | null
  message?: string | null
  data?: {
    link?: string | null
    manifest_id?: string | null
    created_at?: string | null
    [key: string]: unknown
  } | null
  manifest_id?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformManifest(
  raw: XpressbeesManifestRaw,
  awbNumbers: string[] = [],
): Manifest {
  const inner = raw.data ?? {}
  const manifestId = inner.manifest_id ?? raw.manifest_id ?? undefined
  return {
    id: manifestId != null ? String(manifestId) : undefined,
    carrierId: 'xpressbees',
    status: raw.response ? 'SUBMITTED' : 'OPEN',
    shipmentIds: awbNumbers,
    labelCount: awbNumbers.length,
    submittedAt: raw.response ? new Date() : undefined,
    createdAt: toISODate(inner.created_at ?? raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
