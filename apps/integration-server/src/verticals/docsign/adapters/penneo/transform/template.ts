import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

export interface RawPenneoCasefileTemplate {
  id: number | string
  title?: string
  description?: string
  created?: string
  updated?: string
  documentTypeIds?: number[]
  signerRoles?: string[]
  [key: string]: unknown
}

export function transformTemplate(raw: RawPenneoCasefileTemplate): Template {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.title) ?? '',
    description: pickStr(raw.description),
    signerRoles: raw.signerRoles ?? [],
    documentCount: (raw.documentTypeIds ?? []).length || 1,
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.updated),
    platform: 'penneo',
    metadata: strMap({}),
    raw,
  }
}
