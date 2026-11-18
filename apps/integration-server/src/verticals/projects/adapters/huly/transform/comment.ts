/**
 * Huly ChatMessage → canonical Comment.
 *
 * Issue comments are `chunter:class:ChatMessage` documents attached to the
 * issue. Fields, from hcengineering/platform plugins/chunter/src/index.ts
 * (`interface ChatMessage extends ActivityMessage { message: Markup;
 * attachments?: number; editedOn?: Timestamp }`), plugins/activity/src/index.ts
 * (`interface ActivityMessage extends AttachedDoc`) and huly.core
 * packages/core/src/classes.ts (`AttachedDoc { attachedTo; attachedToClass;
 * collection }`, `Doc { createdBy?: PersonId; createdOn?: Timestamp }`,
 * `type Markup = string`).
 *
 * `createdBy` and `createdOn` are optional in the type only because "it will
 * be filled by platform" (classes.ts); a stored message without them has no
 * author or creation time to report, so the transform throws rather than
 * inventing one.
 */
import type { Comment } from '../../../schema'
import { pickNum, strMap, toIso } from './shared'

export interface RawHulyComment {
  _id: string
  _class: string
  space: string
  /** The document (issue) this message is attached to. */
  attachedTo?: string
  attachedToClass?: string
  /** Markup string. */
  message?: string
  attachments?: number
  editedOn?: number
  createdBy?: string
  createdOn?: number
  modifiedOn: number
  [key: string]: unknown
}

/**
 * @param authorPersonId  the Person `_id` (the id `transformUser` emits) that
 *                        `raw.createdBy` resolves to. `createdBy` itself is a
 *                        PersonId — a social identity (classes.ts `SocialId {
 *                        _id: PersonId }`), not a Person — so the caller
 *                        resolves it through `contact:class:SocialIdentity`
 *                        (`attachedTo: Ref<Person>`).
 */
export function transformComment(
  raw: RawHulyComment,
  authorPersonId: string,
  taskId?: string,
): Comment {
  const createdAt = toIso(raw.createdOn)
  if (!raw.createdBy || !createdAt) {
    throw new Error(`Huly message ${raw._id} has no createdBy/createdOn`)
  }
  // `message: Markup` is required on ChatMessage (`type Markup = string`); it
  // is passed through as stored.
  if (typeof raw.message !== 'string') {
    throw new Error(`Huly message ${raw._id} has no message`)
  }
  return {
    id: raw._id,
    externalId: raw._id,
    taskId: taskId ?? raw.attachedTo,
    authorId: authorPersonId,
    body: raw.message,
    mentions: [],
    attachmentCount: pickNum(raw.attachments),
    createdAt,
    updatedAt: toIso(raw.editedOn),
    platform: 'huly',
    metadata: strMap({ attachedToClass: raw.attachedToClass, createdBy: raw.createdBy }),
    raw,
  }
}
