/**
 * Kaiten "space" → canonical Workspace.
 *
 * Space fields (from GET /spaces):
 *   id, uid, title, created, updated, archived, access,
 *   company_id, entity_type, sort_order, boards (array of board objects)
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import type { RawKaitenBoard } from './project'

export interface RawKaitenSpace {
  id: number
  uid?: string
  title?: string
  created?: string
  updated?: string
  archived?: boolean
  access?: string
  company_id?: number
  entity_type?: string
  sort_order?: number
  /** "Space boards" (GET /spaces). */
  boards?: RawKaitenBoard[]
  [key: string]: unknown
}

export function transformWorkspace(raw: RawKaitenSpace): Workspace {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.title) ?? '',
    platform: 'kaiten',
    metadata: strMap({
      uid: raw.uid,
      archived: raw.archived,
      access: raw.access,
      companyId: raw.company_id,
      entityType: raw.entity_type,
      createdAt: toIso(raw.created),
      updatedAt: toIso(raw.updated),
    }),
    raw,
  }
}
