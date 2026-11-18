import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Weeek workspace response shape.
 * Returned by GET /ws → { success, workspace: RawWeeekWorkspace }
 */
export interface RawWeeekWorkspace {
  id: number | string
  title?: string
  description?: string | null
  isPersonal?: boolean
  logo?: string | null
  [key: string]: unknown
}

export function transformWorkspace(raw: RawWeeekWorkspace): Workspace {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.title) ?? '',
    platform: 'weeek',
    metadata: strMap({
      description: raw.description,
      isPersonal: raw.isPersonal,
      logo: raw.logo,
    }),
    raw,
  }
}
