import type { Organization } from '../../../schema/organization'

export interface YonyouOrganization {
  id?: string
  name?: string
  taxpayernum?: string
  [key: string]: unknown
}

export function transformOrganization(raw: YonyouOrganization): Organization {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    taxNumber: raw.taxpayernum || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
