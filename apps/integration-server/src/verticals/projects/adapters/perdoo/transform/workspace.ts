/**
 * Transform a Perdoo Group → canonical Workspace.
 *
 * Perdoo has no explicit workspace concept. Groups (teams/departments) are
 * the top-level organisational unit and map naturally to canonical Workspaces.
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPerdooGroup {
  id: string
  name?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawPerdooGroup): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    platform: 'perdoo',
    metadata: strMap({}),
    raw,
  }
}
