/**
 * Toggl Plan member (user) transform.
 *
 * GET /{workspace_id}/members returns workspace member objects.
 * Members have id, name, email, role, active flag, and color.
 *
 * Docs: https://developers.plan.toggl.com/api-v5.html
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTogglPlanMember {
  id: number | string
  name?: string
  email?: string
  role?: string
  active?: boolean
  color?: string
  color_id?: number
  initials?: string
  hours_per_work_day?: string | number
  minutes_per_work_day?: number
  dummy?: boolean
  picture_url?: string
  has_picture?: boolean
  activated_at?: string | null
  deactivated_at?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformUser(raw: RawTogglPlanMember, workspaceId?: string): User {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'toggl-plan',
    metadata: strMap({
      role: raw.role,
      active: raw.active,
      initials: raw.initials,
      color: raw.color,
      dummy: raw.dummy,
      activatedAt: raw.activated_at ?? undefined,
      deactivatedAt: raw.deactivated_at ?? undefined,
    }),
    raw,
  }
}

