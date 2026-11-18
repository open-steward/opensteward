/**
 * Transform a raw Channel Talk User (end-user / contact) into a canonical Contact.
 *
 * Channel Talk User fields relevant to the contact schema:
 *   id             — string
 *   channelId      — tenant channel ID
 *   memberId       — external member ID set by the integrator (optional)
 *   name           — display name (may be in root or profile.name)
 *   profile        — { name?, email?, mobileNumber?, avatarUrl?, ... }
 *   tags           — string[]
 *   createdAt      — epoch ms
 *
 * Docs: https://developers.channel.io/docs/get-a-single-user
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

interface ChannelTalkUserProfile {
  name?: string
  email?: string
  mobileNumber?: string
  avatarUrl?: string
  [key: string]: unknown
}

export interface RawChannelTalkUser {
  id: string
  channelId?: string
  memberId?: string | null
  veilId?: string | null
  name?: string
  profile?: ChannelTalkUserProfile | null
  tags?: string[]
  createdAt?: number
  [key: string]: unknown
}

export function transformContact(raw: RawChannelTalkUser): Contact {
  const profile = raw.profile ?? {}
  const name = pickStr(raw.name) ?? pickStr(profile.name) ?? ''
  const email = pickStr(profile.email)
  const phone = pickStr(profile.mobileNumber)

  return {
    id: raw.id,
    externalId: raw.memberId ? String(raw.memberId) : raw.id,
    email,
    name,
    phone,
    platform: 'channel-talk',
    metadata: strMap({
      channelId: raw.channelId,
      veilId: raw.veilId,
    }),
    raw,
  }
}
