/**
 * Huly Employee → canonical User.
 *
 * Workspace members are Person documents carrying the `contact:mixin:Employee`
 * mixin (hcengineering/platform plugins/contact/src/index.ts:
 * `interface Contact extends Doc { name: string ... }`,
 * `interface Employee extends Person { active: boolean; ... }`). Only the
 * Person base fields are read: email lives in separate `contact:class:Channel`
 * documents and is not fetched.
 */
import type { User } from '../../../schema'

export interface RawHulyUser {
  _id: string
  _class: string
  space: string
  name: string
  modifiedOn: number
  [key: string]: unknown
}

export function transformUser(raw: RawHulyUser, workspaceId: string): User {
  return {
    id: raw._id,
    externalId: raw._id,
    name: raw.name,
    workspaceIds: [workspaceId],
    platform: 'huly',
    metadata: {},
    raw,
  }
}
