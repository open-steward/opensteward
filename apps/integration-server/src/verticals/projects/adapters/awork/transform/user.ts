import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawAworkUserContactInfo {
  type?: string
  subType?: string
  value?: string
  [key: string]: unknown
}

export interface RawAworkUser {
  id: string
  firstName?: string
  lastName?: string
  userContactInfos?: RawAworkUserContactInfo[] | null
  status?: { invitationAccepted?: boolean; isDeactivated?: boolean } | null
  isDeactivated?: boolean
  createdOn?: string
  [key: string]: unknown
}

function pickEmail(raw: RawAworkUser): string | undefined {
  const info = (raw.userContactInfos ?? []).find(
    (c) => (c.type ?? '').toLowerCase() === 'email' && pickStr(c.value),
  )
  return pickStr(info?.value)
}

function fullName(raw: RawAworkUser): string {
  return [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean).join(' ').trim()
}

export function transformUser(raw: RawAworkUser, workspaceId?: string): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickEmail(raw),
    name: fullName(raw),
    // awork is single-workspace per account; surface the caller's scope if given.
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'awork',
    metadata: strMap({
      isDeactivated: raw.status?.isDeactivated ?? raw.isDeactivated,
      invitationAccepted: raw.status?.invitationAccepted,
    }),
    raw,
  }
}
