import type { Manifest } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ─── Canada Post raw types ──────────────────────────────────────────────────

/**
 * An individual link element within a manifest response.
 * Canada Post returns link elements with rel/href attributes.
 */
export interface CanadaPostManifestLink {
  rel: string
  href: string
  'media-type'?: string | null
  index?: string | null
  [key: string]: unknown
}

/**
 * Response from GET /rs/{customer}/{mobo}/manifest/{manifestid}
 * (Accept: application/vnd.cpc.manifest-v8+xml)
 */
export interface CanadaPostManifest {
  'po-number'?: string | null
  'customer-request-id'?: string | null
  'manifest-id'?: string | null
  'shipment-count'?: string | number | null
  /** Transmission date (ISO or YYYY-MM-DD) */
  'transmission-date'?: string | null
  links?: { link: CanadaPostManifestLink | CanadaPostManifestLink[] } | null
  [key: string]: unknown
}

/**
 * A single entry returned by the Get Manifests (list) response:
 * GET /rs/{customer}/{mobo}/manifest?start=YYYYMMDD&end=YYYYMMDD
 * The list response contains only link elements; each link's href
 * points to an individual manifest resource.
 */
export interface CanadaPostManifestListLink {
  rel?: string | null
  href: string
  /** Encodes manifest-specific metadata that we surface via metadata */
  [key: string]: unknown
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function linksArray(
  links: CanadaPostManifest['links'],
): CanadaPostManifestLink[] {
  if (!links) return []
  const raw = links.link
  return Array.isArray(raw) ? raw : [raw]
}

/** Extract manifest-id from the self-link href, e.g. /rs/.../manifest/{id} */
function extractManifestId(links: CanadaPostManifestLink[]): string | undefined {
  const self = links.find((l) => l.rel === 'self')
  if (!self) return undefined
  const parts = self.href.split('/')
  return parts[parts.length - 1] || undefined
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformManifest(raw: CanadaPostManifest): Manifest {
  const links = linksArray(raw.links)
  const manifestId = raw['manifest-id'] ?? extractManifestId(links)
  const shipmentCount =
    typeof raw['shipment-count'] === 'number'
      ? raw['shipment-count']
      : raw['shipment-count'] != null
        ? parseInt(String(raw['shipment-count']), 10) || undefined
        : undefined

  return {
    id: manifestId ?? undefined,
    carrierId: 'canada-post',
    manifestNumber: raw['po-number'] ?? undefined,
    // Canada Post manifests are always in SUBMITTED / ACCEPTED state once
    // returned from the API (they are created by Transmit Shipments).
    status: 'SUBMITTED',
    labelCount: shipmentCount,
    submittedAt: toISODate(raw['transmission-date']),
    createdAt: toISODate(raw['transmission-date']),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a list-link href into a minimal Manifest stub.
 * The Get Manifests endpoint only returns link elements; a separate
 * Get Manifest call (using the href) returns full detail.
 */
export function transformManifestListLink(link: CanadaPostManifestListLink): Manifest {
  const parts = link.href.split('/')
  const id = parts[parts.length - 1] || undefined
  return {
    id,
    carrierId: 'canada-post',
    status: 'SUBMITTED',
    metadata: link as Record<string, unknown>,
  }
}
