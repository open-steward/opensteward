import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── DHL eCommerce raw types ────────────────────────────────────────────────
// Source: POST /shipping/v4/manifest   (DHL eCommerce Americas API v4)
//         GET  /shipping/v4/manifest/{pickup}/{requestId}

export interface DhlEcommerceManifestPackageError {
  packageId?: string | null
  dhlPackageId?: string | null
  error?: string | null
  [key: string]: unknown
}

export interface DhlEcommerceManifestDocument {
  /** URL to the Driver's Summary Manifest (DSM) document */
  url?: string | null
  /** "DOMESTIC" | "INTERNATIONAL" */
  type?: string | null
  [key: string]: unknown
}

export interface DhlEcommerceManifest {
  /** Echo of the pickup number */
  pickup?: string | null
  /** Unique identifier returned from POST /shipping/v4/manifest */
  requestId?: string | null
  /**
   * Processing status:
   *   "CREATED"     — request received, not yet started
   *   "IN_PROGRESS" — actively processing
   *   "COMPLETED"   — finished
   */
  status?: string | null
  /** IDs of packages successfully included in this manifest */
  packageIds?: string[] | null
  /** Packages that could not be manifested */
  packageErrors?: DhlEcommerceManifestPackageError[] | null
  /** Manifest documents available for download */
  documents?: DhlEcommerceManifestDocument[] | null
  /** Timestamp when the manifest was created */
  createdAt?: string | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapManifestStatus(status: string | null | undefined): ManifestStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'CREATED':     return 'OPEN'
    case 'IN_PROGRESS': return 'SUBMITTED'
    case 'COMPLETED':   return 'ACCEPTED'
    default:            return 'UNKNOWN' as ManifestStatus
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformManifest(raw: DhlEcommerceManifest): Manifest {
  const packageIds = (raw.packageIds ?? []).filter(Boolean) as string[]

  return {
    id: raw.requestId ?? raw.pickup ?? undefined,
    carrierId: 'dhl-ecommerce',
    manifestNumber: raw.requestId ?? undefined,
    status: mapManifestStatus(raw.status),
    shipmentIds: packageIds.length > 0 ? packageIds : undefined,
    labelCount: packageIds.length > 0 ? packageIds.length : undefined,
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
