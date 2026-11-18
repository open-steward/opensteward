/**
 * Transform a Channel Talk `ChatTag` into a canonical Tag.
 *
 * Source: Channel Talk Open API (https://api-doc.channel.io/docs/openapi.en.yaml,
 * components.schemas.ChatTag): "ChatTag represents a label that can be
 * attached to user chats for categorization." Required: id, channelId, name,
 * key, createdAt. Optional: colorVariant (a named colour such as `cobalt`, not
 * a hex value, so it goes to metadata rather than the canonical `color`) and
 * description.
 */
import type { Tag } from '../../../schema'
import { strMap } from './shared'

export interface RawChannelTalkChatTag {
  /** "Unique chat tag identifier." */
  id: string
  /** "Channel ID this chat tag belongs to." */
  channelId: string
  /** "Display name of the chat tag." ("/" separates up to 3 levels) */
  name: string
  /** "Lowercase representation of name. Unique within the channel." */
  key: string
  /** "Chat tag creation timestamp." (date-time) */
  createdAt: string
  colorVariant?: string
  description?: string
}

export function transformTag(raw: RawChannelTalkChatTag): Tag {
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    throw new Error('channel-talk ChatTag has no id')
  }
  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    throw new Error(`channel-talk ChatTag ${raw.id} has no name`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.name,
    platform: 'channel-talk',
    metadata: strMap({
      channelId: raw.channelId,
      key: raw.key,
      createdAt: raw.createdAt,
      colorVariant: raw.colorVariant,
      description: raw.description,
    }),
    raw,
  }
}
