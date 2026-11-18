import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * Anvil `Cast` — a PDF template. Casts define the fillable fields and the
 * roles (`allowedAliasIds`) used to address signers. A Cast represents a
 * single PDF, so `documentCount` is 1.
 *
 * Docs: https://www.useanvil.com/docs/api/graphql/reference/
 */
export interface RawAnvilCast {
  eid: string
  name?: string
  title?: string
  allowedAliasIds?: string[]
  publishedNumber?: number
  versionNumber?: number
  isTemplate?: boolean
  archivedAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawAnvilCast): Template {
  return {
    id: raw.eid,
    externalId: raw.eid,
    name: pickStr(raw.title) ?? pickStr(raw.name) ?? '',
    signerRoles: (raw.allowedAliasIds ?? []).filter(
      (r): r is string => typeof r === 'string',
    ),
    documentCount: 1,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    platform: 'anvil',
    metadata: strMap({
      name: raw.name,
      publishedNumber: raw.publishedNumber,
      versionNumber: raw.versionNumber,
      archivedAt: raw.archivedAt,
    }),
    raw,
  }
}
