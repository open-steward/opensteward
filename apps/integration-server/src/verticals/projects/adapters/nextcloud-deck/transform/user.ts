/**
 * Transform a Nextcloud sharee / board member into the canonical User schema.
 *
 * Users appear in board ACL entries and card assignments.
 * The Nextcloud sharees API returns { uid, displayname } objects.
 * Card assignments return { participant: { uid, displayname } }.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawNextcloudDeckUser {
  uid?: string
  displayname?: string
  type?: number
  [key: string]: unknown
}

export function transformUser(raw: RawNextcloudDeckUser, workspaceId?: string): User {
  const uid = pickStr(raw.uid) ?? ''
  // Compound id: "<boardId>/<uid>" — matches getUser() parsing logic
  const compoundId = workspaceId ? `${workspaceId}/${uid}` : uid
  return {
    id: compoundId,
    externalId: uid,
    email: undefined,
    name: pickStr(raw.displayname) ?? uid,
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'nextcloud-deck',
    metadata: strMap({
      type: raw.type,
    }),
    raw,
  }
}
