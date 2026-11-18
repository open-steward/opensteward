/**
 * Nextcloud Deck does not have a native "workspace" concept — the Nextcloud
 * server itself is the workspace. We synthesise a single Workspace record
 * from the server URL stored in credentials.extra.serverUrl so that callers
 * always receive at least one workspace entry.
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawNextcloudDeckServer {
  serverUrl?: string
  version?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawNextcloudDeckServer): Workspace {
  const url = pickStr(raw.serverUrl) ?? ''
  const id = url || 'nextcloud-server'
  return {
    id,
    externalId: id,
    name: url || 'Nextcloud Server',
    platform: 'nextcloud-deck',
    metadata: strMap({
      serverUrl: url,
      version: raw.version,
    }),
    raw,
  }
}
