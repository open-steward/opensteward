/**
 * Wekan board label → canonical Tag.
 *
 * Labels are embedded on the board object:
 *   board.labels[]{_id, name, color}
 *
 * The boardId is passed through so consumers can scope tags to their board.
 */
import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawWekanLabel {
  _id: string
  name?: string
  color?: string
  [key: string]: unknown
}

export function transformLabel(raw: RawWekanLabel, boardId: string): Tag {
  return {
    id: raw._id,
    externalId: raw._id,
    workspaceId: boardId,
    name: pickStr(raw.name) ?? '',
    color: pickStr(raw.color),
    platform: 'wekan',
    metadata: strMap({}),
    raw,
  }
}
