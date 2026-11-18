import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Float has no "workspace" concept. The closest top-level grouping is the
 * Client (`GET /clients`): projects reference a client via `client_id`, so a
 * client maps to the canonical Workspace.
 */
export interface RawFloatClient {
  client_id: number | string
  name?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawFloatClient): Workspace {
  const id = String(raw.client_id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'float',
    metadata: strMap({}),
    raw,
  }
}
