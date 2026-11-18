import type { Tag } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Microsoft Outlook / To Do categories — the master list of user-defined
 * categories that can be attached to any Outlook item including `todoTask`.
 *
 * Endpoint: GET /me/outlook/masterCategories
 * Scope:    MailboxSettings.Read  (separate from Tasks.Read — must be added
 *           to DEFAULT_SCOPES for this resource to be available).
 *
 * The `color` property is one of 25 pre-set constants (e.g. "preset0" = Red).
 * `displayName` is unique per user mailbox. The resource `id` is a GUID.
 */
export interface RawOutlookCategory {
  id: string
  displayName?: string
  color?: string
  [key: string]: unknown
}

/**
 * Maps a predefined Outlook color constant to a CSS hex colour string so the
 * canonical `Tag.color` field is populated with something meaningful. Only the
 * 25 pre-set constants are mapped; "None" and unknown values yield undefined.
 */
const PRESET_COLORS: Record<string, string> = {
  preset0: '#e74c3c',
  preset1: '#e67e22',
  preset2: '#a0522d',
  preset3: '#f1c40f',
  preset4: '#2ecc71',
  preset5: '#1abc9c',
  preset6: '#808000',
  preset7: '#3498db',
  preset8: '#9b59b6',
  preset9: '#c0392b',
  preset10: '#708090',
  preset11: '#2f4f4f',
  preset12: '#808080',
  preset13: '#696969',
  preset14: '#000000',
  preset15: '#8b0000',
  preset16: '#d2691e',
  preset17: '#5c3317',
  preset18: '#b8860b',
  preset19: '#006400',
  preset20: '#008080',
  preset21: '#556b2f',
  preset22: '#00008b',
  preset23: '#4b0082',
  preset24: '#8b0045',
}

export function transformTag(raw: RawOutlookCategory, workspaceId = 'me'): Tag {
  const colorKey = (raw.color ?? '').toLowerCase()
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId,
    name: pickStr(raw.displayName) ?? '',
    color: PRESET_COLORS[colorKey],
    platform: 'microsoft-todo',
    metadata: strMap({ outlookColor: raw.color }),
    raw,
  }
}
