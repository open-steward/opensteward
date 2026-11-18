import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Kanboard has no workspace concept — the entire Kanboard instance acts as a
 * single workspace.  We synthesise one from the application-info response
 * returned by the `getVersion` / `getDefaultTaskColors` procedures, or just
 * from the base URL stored in credentials.
 *
 * The `id` is always the literal string "default".
 */
export interface RawKanboardWorkspace {
  /** Synthetic ID — always "default" for the single Kanboard instance. */
  id?: string
  /** Instance URL or app title used as the workspace name. */
  name?: string
  version?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawKanboardWorkspace): Workspace {
  return {
    id: raw.id ?? 'default',
    externalId: raw.id ?? 'default',
    name: pickStr(raw.name) ?? 'Kanboard',
    platform: 'kanboard',
    metadata: strMap({ version: raw.version }),
    raw,
  }
}
