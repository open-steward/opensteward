/**
 * Maps a Document360 workspace (project version) to the canonical Team shape.
 *
 * Project versions segment a knowledge base (e.g. "v1", "v2"). They are the
 * closest grouping concept to "teams" in the canonical schema.
 *
 * Source: https://apihub.document360.io/swagger/v2/swagger.json,
 * `ProjectVersionCustomer` ("Returned by `GET /v2/projectversions`"): id,
 * version_number (number, "Project version number"), version_code_name
 * ("Custom version name", nullable), is_main_version, is_beta, is_public,
 * is_deprecated, created_at, modified_at, slug, order, and version_type
 * (enum "knowledgeBase" | "apiDocumentation").
 */
import type { Team } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawDocument360ProjectVersion {
  id?: string | null
  version_number?: number
  base_version_number?: number
  /** "Custom version name" — nullable */
  version_code_name?: string | null
  is_main_version?: boolean
  is_beta?: boolean
  is_public?: boolean
  is_deprecated?: boolean
  slug?: string | null
  order?: number
  /**
   * The schema declares the string enum "knowledgeBase" | "apiDocumentation";
   * the documented examples write `"version_type": 0`. Either is passed through.
   */
  version_type?: string | number
  created_at?: string
  modified_at?: string
  language_versions?: unknown[] | null
  [key: string]: unknown
}

export function transformTeam(raw: RawDocument360ProjectVersion): Team {
  const id = pickStr(raw.id)
  if (!id) throw new Error('document360 project version has no id')
  // The custom name when one is set, else the documented version number.
  const name =
    pickStr(raw.version_code_name) ??
    (typeof raw.version_number === 'number' ? String(raw.version_number) : undefined)
  if (name === undefined) {
    throw new Error(
      `document360 project version ${id} has neither version_code_name nor version_number`,
    )
  }
  return {
    id,
    externalId: id,
    name,
    platform: 'document360',
    metadata: strMap({
      versionNumber: raw.version_number,
      isMainVersion: raw.is_main_version,
      isBeta: raw.is_beta,
      isPublic: raw.is_public,
      isDeprecated: raw.is_deprecated,
      versionType: raw.version_type,
      slug: raw.slug,
      createdAt: toIso(raw.created_at),
      modifiedAt: toIso(raw.modified_at),
    }),
    raw,
  }
}
