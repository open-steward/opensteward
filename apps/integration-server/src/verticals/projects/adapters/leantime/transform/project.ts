/**
 * Transform a Leantime project API object into the canonical Project schema.
 *
 * Leantime project response fields (from Projects service / repository):
 *   id, name, clientId, clientName, hourBudget, dollarBudget,
 *   psUserId (owner), description, state (open|closed|archived),
 *   start (ISO date), end (ISO date), created, modified,
 *   type, status (from comment thread), timelineFrom, timelineTo
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawLeantimeProject {
  id?: number | string
  name?: string
  description?: string
  state?: string
  status?: string
  psUserId?: number | string
  clientId?: number | string
  clientName?: string
  start?: string
  end?: string
  created?: string
  modified?: string
  type?: string
  [key: string]: unknown
}

function mapStatus(raw: RawLeantimeProject): ProjectStatus {
  const state = (raw.state ?? '').toLowerCase()
  if (state === 'archived') return 'archived'
  if (state === 'closed' || state === 'done') return 'closed'
  if (state === 'on_hold' || state === 'paused') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawLeantimeProject): Project {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: raw.psUserId != null ? String(raw.psUserId) : undefined,
    startDate: toIso(raw.start),
    endDate: toIso(raw.end),
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.modified),
    platform: 'leantime',
    metadata: strMap({
      clientId: raw.clientId,
      clientName: raw.clientName,
      type: raw.type,
    }),
    raw,
  }
}
