import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Favro widget (board/backlog). Favro's hierarchy is
 * Organization > Collection > Widget > Card, so a widget — a single board or
 * backlog — is the closest analogue to a canonical project. The owning
 * organization is the workspace; linked collections are kept as context on
 * metadata. Favro widgets carry no created/updated timestamps or owner on the
 * widget object, so those optionals are left undefined.
 */
export interface RawFavroWidget {
  widgetCommonId: string
  organizationId?: string
  collectionIds?: string[]
  name?: string
  type?: string
  color?: string
  ownerRole?: string
  editRole?: string
  archived?: boolean
  [key: string]: unknown
}

function mapStatus(raw: RawFavroWidget): ProjectStatus {
  return raw.archived ? 'archived' : 'active'
}

export function transformProject(raw: RawFavroWidget): Project {
  return {
    id: raw.widgetCommonId,
    externalId: raw.widgetCommonId,
    workspaceId: pickStr(raw.organizationId) ?? '',
    name: pickStr(raw.name) ?? '',
    description: undefined,
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'favro',
    metadata: strMap({
      type: raw.type,
      color: raw.color,
      collectionIds: raw.collectionIds?.join(','),
      archived: raw.archived,
    }),
    raw,
  }
}
