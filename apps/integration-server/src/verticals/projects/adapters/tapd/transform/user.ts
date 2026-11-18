import { toIsoDatetime } from '@opensteward/shared'
import type { User } from '../../../schema'
import { strMap } from './shared'

/**
 * Raw TAPD workspace member, the `UserWorkspace` item of
 * GET https://api.tapd.cn/workspaces/users
 * (https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/workspace/users.html):
 *   "user 成员昵称 · role_id 用户组ID · email 成员邮箱号 · name 真实姓名 ·
 *    real_join_time 加入项目（公司）时间"
 * The documented example returns only `user` and `role_id`; name and email
 * come back when requested through `fields`.
 */
export interface RawTapdUser {
  user: string
  role_id?: string[]
  name?: string
  email?: string
  real_join_time?: string
  [key: string]: unknown
}

/**
 * The member's nickname (`user`) is TAPD's handle for a person: story
 * owners and comment authors are nicknames too. The canonical id is
 * `{workspace_id}:{user}` so getUser can send the required workspace_id.
 * `name` is the documented real name, else the documented nickname.
 */
export function transformUser(raw: RawTapdUser, workspaceId: string): User {
  if (typeof raw.user !== 'string' || !raw.user) {
    throw new Error("TAPD workspace member has no documented 'user' (nickname) field")
  }
  return {
    id: `${workspaceId}:${raw.user}`,
    externalId: raw.user,
    email: raw.email || undefined,
    name: raw.name || raw.user,
    workspaceIds: [workspaceId],
    platform: 'tapd',
    metadata: strMap({
      nick: raw.user,
      roleIds: Array.isArray(raw.role_id) ? raw.role_id.join(',') : undefined,
      joinedAt: toIsoDatetime(raw.real_join_time),
    }),
    raw,
  }
}
