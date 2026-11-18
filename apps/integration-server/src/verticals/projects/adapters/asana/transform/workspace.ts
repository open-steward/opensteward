import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawAsanaWorkspace {
  gid: string
  name?: string
  is_organization?: boolean
  email_domains?: string[]
  [key: string]: unknown
}

export function transformWorkspace(raw: RawAsanaWorkspace): Workspace {
  return {
    id: raw.gid,
    externalId: raw.gid,
    name: pickStr(raw.name) ?? '',
    platform: 'asana',
    metadata: strMap({
      isOrganization: raw.is_organization,
      emailDomains: raw.email_domains?.join(','),
    }),
    raw,
  }
}
