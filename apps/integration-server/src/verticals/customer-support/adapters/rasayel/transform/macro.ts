/**
 * Transform a Rasayel SavedReply into the canonical Macro shape.
 *
 * Rasayel SavedReply fields (GraphQL):
 *   id (Int!), uuid (String!), title (String!), body (MdString!),
 *   attachment (Attachment), folder (SavedReplyFolder),
 *   active (Boolean!), createdAt (Int!), updatedAt (Int!),
 *   createdBy (AppUser!), account (Account!), app (App!)
 *
 * The canonical Macro maps: title → title, body → body,
 * folder.name → category (optional).
 */
import type { Macro } from '../../../schema'
import { pickStr, strMap } from './shared'

interface RawSavedReplyFolder {
  id?: number
  name?: string
  [key: string]: unknown
}

export interface RawRasayelSavedReply {
  id: number
  uuid?: string
  title?: string
  body?: string
  folder?: RawSavedReplyFolder | null
  active?: boolean
  createdAt?: number
  updatedAt?: number
  [key: string]: unknown
}

export function transformMacro(raw: RawRasayelSavedReply): Macro {
  const category = raw.folder?.name ? pickStr(raw.folder.name) : undefined

  return {
    id: String(raw.id),
    externalId: raw.uuid ?? String(raw.id),
    title: pickStr(raw.title) ?? '',
    body: pickStr(raw.body) ?? '',
    category,
    platform: 'rasayel',
    metadata: strMap({
      uuid: raw.uuid,
      active: raw.active != null ? String(raw.active) : undefined,
      folderId: raw.folder?.id != null ? String(raw.folder.id) : undefined,
      folderName: raw.folder?.name,
    }),
    raw,
  }
}
