import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * PingCode enterprise / team (`GET /v1/directory/team`).
 *
 * PingCode's organisational model has a single enterprise (企业) per OAuth
 * credential — there is no multi-workspace hierarchy below it.  The canonical
 * `Workspace` resource maps cleanly onto this enterprise object:
 *
 *   enterprise.id            → workspace.id / externalId
 *   enterprise.name          → workspace.name
 *   enterprise.secondary_domain → metadata.secondaryDomain
 *
 * The endpoint returns a single full-structure object (not a paged list);
 * `listWorkspaces` therefore returns a one-element array and
 * `getWorkspace` ignores its `id` parameter (there is only one).
 *
 * Docs: https://open.pingcode.com/  →  Organization / Enterprise
 */
export interface RawPingcodeTeam {
  id: string
  name?: string
  secondary_domain?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawPingcodeTeam): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    platform: 'pingcode',
    metadata: strMap({
      secondaryDomain: raw.secondary_domain,
    }),
    raw,
  }
}
