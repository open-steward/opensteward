import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * A canonical Workspace maps to a Coda **workspace**. Coda has no
 * "list workspaces" endpoint — workspaces are surfaced as the `workspace`
 * reference on each doc (and the active token's workspace via `/whoami`), so
 * this raw shape covers both the full `Workspace` object and the lighter
 * `WorkspaceReference` carried on docs.
 */
export interface RawCodaWorkspace {
  id: string
  type?: 'workspace'
  organizationId?: string
  browserLink?: string
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawCodaWorkspace): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    platform: 'coda',
    metadata: strMap({
      organizationId: raw.organizationId,
      description: raw.description,
      browserLink: raw.browserLink,
    }),
    raw,
  }
}
