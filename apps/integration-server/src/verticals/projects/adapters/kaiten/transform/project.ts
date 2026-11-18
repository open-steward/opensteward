/**
 * Kaiten "board" → canonical Project.
 *
 * In Kaiten the hierarchy is Space → Board → Card. A Board is the closest
 * analogue to a project: it owns columns, lanes and cards. Spaces map to
 * Workspaces (see workspace.ts).
 *
 * Board fields read here are the documented ones of "Get list of boards"
 * (GET /spaces/{space_id}/boards, https://developers.kaiten.ru/space-boards/get-list-of-boards)
 * and of the `boards` array of "Retrieve list of spaces"
 * (GET /spaces, https://developers.kaiten.ru/spaces/retrieve-list-of-spaces):
 * `id` "Board id", `title` "Board title", `description` "Board description",
 * `created` "Create date", `updated` "Last update timestamp", `space_id`
 * "Space id", `external_id` "External id".
 *
 * A board documents no status of its own. Its space documents `archived`
 * ("Space archived flag"), so the status is taken from the parent space when
 * the caller has it, and is 'unknown' otherwise.
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawKaitenBoard {
  id: number
  title?: string
  description?: string | null
  created?: string
  updated?: string
  space_id?: number
  external_id?: string | null
  [key: string]: unknown
}

/** The documented fields of the board's parent space that the transform reads. */
export interface KaitenBoardSpace {
  id: number
  archived?: boolean
}

function mapStatus(space: KaitenBoardSpace | undefined): ProjectStatus {
  if (space?.archived === true) return 'archived'
  if (space?.archived === false) return 'active'
  return 'unknown'
}

export function transformProject(raw: RawKaitenBoard, space?: KaitenBoardSpace): Project {
  const id = String(raw.id)
  if (raw.space_id == null) {
    throw new Error(`Kaiten board ${id} carries no space_id`)
  }
  const spaceId = String(raw.space_id)
  return {
    id,
    externalId: id,
    workspaceId: spaceId,
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description ?? undefined),
    status: mapStatus(space),
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'kaiten',
    metadata: strMap({ spaceId, externalId: raw.external_id }),
    raw,
  }
}
