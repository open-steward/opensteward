/**
 * Transform a Nextcloud Deck label into the canonical Tag schema.
 *
 * Labels are board-level and can be assigned to multiple cards.
 * Each label has: id, title, color (hex without #), boardId.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawNextcloudDeckLabel {
  id: number
  title?: string
  color?: string
  boardId?: number
  cardId?: number | null
  [key: string]: unknown
}

export function transformLabel(raw: RawNextcloudDeckLabel, workspaceId?: string): Tag {
  const boardId = workspaceId ?? (raw.boardId != null ? String(raw.boardId) : '')
  const labelId = String(raw.id)
  // Compound id: "<boardId>/<labelId>" — matches getTag() parsing logic
  const compoundId = `${boardId}/${labelId}`
  return {
    id: compoundId,
    externalId: labelId,
    workspaceId: boardId,
    name: pickStr(raw.title) ?? '',
    color: pickStr(raw.color),
    platform: 'nextcloud-deck',
    metadata: strMap({
      boardId: raw.boardId,
    }),
    raw,
  }
}
