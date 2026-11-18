import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * Viafirma "template" linked to a user. The list endpoint returns a flat
 * array of these; there is no role/document breakdown, so `signerRoles`
 * is empty and `documentCount` is 0 (each template renders a single
 * document at signing time).
 */
export interface RawViafirmaTemplate {
  code: string
  title?: string
  description?: string
  creationDate?: number | string
  groups?: string
  onlyWacom?: boolean
  version?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawViafirmaTemplate): Template {
  return {
    id: raw.code,
    externalId: raw.code,
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    signerRoles: [],
    documentCount: 0,
    createdAt: toIso(raw.creationDate),
    platform: 'viafirma',
    metadata: strMap({
      groups: raw.groups,
      onlyWacom: raw.onlyWacom,
      version: raw.version,
    }),
    raw,
  }
}
