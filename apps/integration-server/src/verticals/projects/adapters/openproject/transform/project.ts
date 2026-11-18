import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso, linkId, linkTitle, type HalLink } from './shared'

/** OpenProject `Formattable` — markdown/text body with rendered html. */
interface Formattable {
  format?: string
  raw?: string | null
  html?: string | null
}

/**
 * HAL+JSON Project resource. OpenProject has no "workspace" concept — a
 * project is the top-level container — so canonical `workspaceId` is empty.
 * The lifecycle status is a separate `ProjectStatus` link whose id is a
 * code such as `on_track` / `at_risk` / `off_track` / `finished`.
 */
export interface RawOpenProjectProject {
  _type?: string
  id?: number | string
  identifier?: string
  name?: string
  active?: boolean
  public?: boolean
  description?: Formattable | null
  createdAt?: string
  updatedAt?: string
  _links?: {
    self?: HalLink
    status?: HalLink
    parent?: HalLink
  }
  [key: string]: unknown
}

function mapStatus(raw: RawOpenProjectProject): ProjectStatus {
  if (raw.active === false) return 'archived'
  const code = (linkId(raw._links?.status) ?? '').toLowerCase()
  if (code === 'finished') return 'completed'
  if (code === 'at_risk' || code === 'off_track') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawOpenProjectProject): Project {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description?.raw),
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'openproject',
    metadata: strMap({
      identifier: raw.identifier,
      public: raw.public,
      statusCode: linkId(raw._links?.status),
      statusTitle: linkTitle(raw._links?.status),
      parentId: linkId(raw._links?.parent),
    }),
    raw,
  }
}
