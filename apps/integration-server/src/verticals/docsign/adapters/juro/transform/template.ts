import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'
import type { RawJuroSigningSide } from './envelope'

export interface RawJuroTemplate {
  id: string
  name?: string
  status?: string
  createdDate?: string
  updatedDate?: string
  signingSides?: RawJuroSigningSide[]
  internalUrl?: string
  sharingUrl?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawJuroTemplate): Template {
  const sides = raw.signingSides ?? []
  const signerRoles = sides
    .map((s) => pickStr(s.name) ?? pickStr(s.uid) ?? '')
    .filter((s): s is string => Boolean(s))
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.name) ?? '',
    signerRoles,
    // Juro templates render exactly one contract document.
    documentCount: 1,
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.updatedDate),
    platform: 'juro',
    metadata: strMap({
      status: raw.status,
      internalUrl: raw.internalUrl,
      sharingUrl: raw.sharingUrl,
    }),
    raw,
  }
}
