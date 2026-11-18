import type { Project } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawProductplanRoadmap {
  id?: number | string
  name?: string
  description?: string
  updated_at?: string
  created_at?: string
  is_version?: boolean
  [key: string]: unknown
}

export function transformProject(raw: RawProductplanRoadmap): Project {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: 'active',
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'productplan',
    metadata: strMap({
      isVersion: raw.is_version,
    }),
    raw,
  }
}
