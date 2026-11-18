/**
 * Transform a Nextcloud Deck board into the canonical Project schema.
 *
 * Nextcloud Deck boards map 1-to-1 to the canonical Project concept.
 * Boards have an `archived` flag, an `owner`, labels, and a `lastModified`
 * Unix timestamp.
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawNextcloudDeckBoard {
  id: number
  title?: string
  color?: string
  archived?: boolean
  owner?: { uid?: string; displayname?: string }
  labels?: Array<{ id: number; title: string; color: string; boardId?: number }>
  permissions?: Record<string, boolean>
  shared?: number
  lastModified?: number
  [key: string]: unknown
}

function mapStatus(raw: RawNextcloudDeckBoard): ProjectStatus {
  if (raw.archived) return 'archived'
  return 'active'
}

function unixToIso(ts: number | undefined): string | undefined {
  if (ts == null) return undefined
  return toIso(new Date(ts * 1000).toISOString())
}

export function transformProject(raw: RawNextcloudDeckBoard): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    workspaceId: '',
    name: pickStr(raw.title) ?? '',
    description: undefined,
    status: mapStatus(raw),
    ownerId: pickStr(raw.owner?.uid),
    startDate: undefined,
    endDate: undefined,
    createdAt: unixToIso(raw.lastModified),
    updatedAt: unixToIso(raw.lastModified),
    platform: 'nextcloud-deck',
    metadata: strMap({
      color: raw.color,
      ownerDisplayname: raw.owner?.displayname,
      shared: raw.shared,
    }),
    raw,
  }
}
