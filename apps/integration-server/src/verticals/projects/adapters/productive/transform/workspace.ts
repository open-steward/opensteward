import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawProductiveWorkspace {
  gid: string
  name?: string
  is_organization?: boolean
  email_domains?: string[]
  [key: string]: unknown
}

export function transformWorkspace(raw: RawProductiveWorkspace): Workspace {
  return {
    id: raw.gid,
    externalId: raw.gid,
    name: pickStr(raw.name) ?? '',
    platform: 'productive',
    metadata: strMap({
      isOrganization: raw.is_organization,
      emailDomains: raw.email_domains?.join(','),
    }),
    raw,
  }
}
