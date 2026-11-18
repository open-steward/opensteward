/**
 * Metapack (Sorted) — Manifest transform.
 *
 * Endpoint: POST /manifests
 * Creates a manifest for future despatch. The 201 response returns only a
 * `links` array (HATEOAS); the manifest code is extracted from the `href` of
 * the self/related link.
 *
 * There is no GET /manifests list endpoint and no GET /manifests/{id} that
 * returns a manifest data object — only GET /manifests/{code}/paperwork which
 * returns a base64-encoded PDF. listManifests and getManifest are therefore
 * not implemented.
 */

import type { Manifest } from '../../../schema/manifest'

// ── Raw Metapack types ─────────────────────────────────────────────────────────

export interface MetapackManifestLink {
  rel?: string | null
  href?: string | null
}

export interface MetapackManifestResponse {
  links?: MetapackManifestLink[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the manifest code from the returned HATEOAS href, e.g. ".../manifests/{code}/..." */
function extractManifestCode(links: MetapackManifestLink[] | undefined): string | undefined {
  if (!links?.length) return undefined
  const href = links[0]?.href ?? ''
  // href pattern: /manifests/{manifestCode}/paperwork
  const match = href.match(/\/manifests\/([^/]+)/)
  return match?.[1] ?? undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformManifest(raw: MetapackManifestResponse): Manifest {
  const code = extractManifestCode(raw.links)
  return {
    id: code,
    manifestNumber: code,
    status: 'SUBMITTED',
    metadata: raw as Record<string, unknown>,
  }
}
