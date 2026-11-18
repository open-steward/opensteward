import type { Comment } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTeambitionStory {
  gid: string
  text?: string
  html_text?: string
  type?: string
  resource_subtype?: string
  created_by?: { gid: string }
  created_at?: string
  target?: { gid: string; resource_type?: string }
  hearts?: Array<{ user?: { gid: string } }>
  [key: string]: unknown
}

export function transformComment(raw: RawTeambitionStory, taskId?: string, projectId?: string): Comment {
  return {
    id: raw.gid,
    externalId: raw.gid,
    taskId: taskId ?? (raw.target?.resource_type === 'task' ? raw.target.gid : undefined),
    projectId: projectId ?? (raw.target?.resource_type === 'project' ? raw.target.gid : undefined),
    authorId: raw.created_by?.gid ?? '',
    body: pickStr(raw.text) ?? '',
    mentions: [],
    attachmentCount: 0,
    createdAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    platform: 'teambition',
    metadata: strMap({ resourceSubtype: raw.resource_subtype }),
    raw,
  }
}
