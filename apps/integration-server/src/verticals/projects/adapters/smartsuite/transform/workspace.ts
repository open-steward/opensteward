/**
 * SmartSuite account maps to a canonical Workspace.
 *
 * SmartSuite does not expose a dedicated workspace-list endpoint.
 * The ACCOUNT-ID header value is the workspace identifier; a single
 * synthetic workspace is returned using the account metadata.
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSmartsuiteAccount {
  id: string
  name?: string | null
  slug?: string | null
  [key: string]: unknown
}

export function transformWorkspace(raw: RawSmartsuiteAccount): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? raw.id,
    platform: 'smartsuite',
    metadata: strMap({
      slug: raw.slug,
    }),
    raw,
  }
}
