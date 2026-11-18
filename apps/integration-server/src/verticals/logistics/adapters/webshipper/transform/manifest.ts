/**
 * Webshipper Manifest → canonical Manifest.
 *
 * Webshipper exposes a `manifests` resource via its JSON:API REST endpoint.
 * A manifest groups labels/shipments that have been handed over to a carrier
 * for physical pick-up.
 *
 * Webshipper manifest attributes (JSON:API `data.attributes`):
 *   status            — 'open' | 'closed' | 'submitted' | …
 *   carrier_id        — integer id for the carrier
 *   shipment_ids      — array of shipment ids included in this manifest
 *   pdf_link          — URL to the manifest PDF
 *   created_at        — ISO-8601 timestamp
 *   updated_at        — ISO-8601 timestamp
 *
 * Docs: https://docs.webshipper.io/
 */

import type { Manifest, ManifestStatus } from '../../../schema/manifest'
import { toISODate } from '../../shared/transform'

// ── Raw types ────────────────────────────────────────────────────────────────

export interface WebshipperManifestAttributes {
  status?: string | null
  /** Carrier identifier (integer) for the manifest. */
  carrier_id?: number | string | null
  /** Shipment IDs grouped in this manifest. */
  shipment_ids?: Array<number | string> | null
  /** Number of labels in the manifest. */
  label_count?: number | null
  pdf_link?: string | null
  created_at?: string | null
  updated_at?: string | null
  submitted_at?: string | null
  [key: string]: unknown
}

export interface WebshipperManifest {
  id?: string | number | null
  type?: string
  attributes?: WebshipperManifestAttributes | null
  [key: string]: unknown
}

// ── Status mapping ───────────────────────────────────────────────────────────

function mapManifestStatus(status: string | null | undefined): ManifestStatus | undefined {
  if (!status) return undefined
  const v = status.toUpperCase()
  switch (v) {
    case 'OPEN': return 'OPEN'
    case 'CLOSED': return 'CLOSED'
    case 'SUBMITTED': return 'SUBMITTED'
    case 'ACCEPTED': return 'ACCEPTED'
    default: return undefined
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformManifest(raw: WebshipperManifest): Manifest {
  const attrs = raw.attributes ?? {}
  const shipmentIds = (attrs.shipment_ids ?? []).map(String)

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    carrierId: attrs.carrier_id != null ? String(attrs.carrier_id) : 'webshipper',
    manifestNumber: raw.id != null ? String(raw.id) : undefined,
    status: mapManifestStatus(attrs.status),
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    labelCount: attrs.label_count ?? undefined,
    submittedAt: toISODate(attrs.submitted_at ?? attrs.updated_at),
    createdAt: toISODate(attrs.created_at),
    updatedAt: toISODate(attrs.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
