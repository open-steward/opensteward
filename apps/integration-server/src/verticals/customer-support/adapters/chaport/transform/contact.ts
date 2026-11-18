import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Chaport visitor object returned by GET /visitors and GET /visitors/:id.
 * Chaport wraps the visitor in `result` at the response level (unwrapped by client).
 */
export interface RawChaportVisitor {
  id: string
  widgetId?: string
  name?: string
  email?: string
  phone?: string
  sourceHost?: string
  language?: string
  lastSeen?: string
  location?: string
  notes?: string
  custom?: Record<string, unknown>
  utm?: {
    source?: string
    medium?: string
    term?: string
    campaign?: string
    content?: string
  }
  browser?: { name?: string; version?: string }
  os?: { name?: string; version?: string }
  [key: string]: unknown
}

export function transformContact(raw: RawChaportVisitor): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone),
    platform: 'chaport',
    metadata: strMap({
      widgetId: raw.widgetId,
      sourceHost: raw.sourceHost,
      language: raw.language,
      lastSeen: toIso(raw.lastSeen),
      location: raw.location,
    }),
    raw,
  }
}
