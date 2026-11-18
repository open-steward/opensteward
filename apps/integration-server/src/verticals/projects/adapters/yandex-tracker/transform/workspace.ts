import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Yandex Tracker queue object from GET /v3/queues.
 * Queues are the closest concept to "workspaces" in Yandex Tracker — each
 * queue owns a set of issues and has its own team, workflows, and settings.
 * Docs: https://yandex.ru/support/tracker/en/api-ref/queues/get-queues
 */
export interface RawYandexTrackerQueue {
  id: string
  key?: string
  name?: string
  description?: string
  lead?: { id: string; display?: string } | null
  assignAuto?: boolean
  [key: string]: unknown
}

export function transformWorkspace(raw: RawYandexTrackerQueue): Workspace {
  return {
    id: String(raw.id),
    externalId: pickStr(raw.key) ?? String(raw.id),
    name: pickStr(raw.name) ?? pickStr(raw.key) ?? '',
    platform: 'yandex-tracker',
    metadata: strMap({ key: raw.key, description: raw.description }),
    raw,
  }
}
