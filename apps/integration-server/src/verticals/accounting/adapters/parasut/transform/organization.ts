import type { Organization } from '../../../schema/organization'

export interface ParasutMe {
  id: string
  type: string
  attributes: {
    name?: string
    email?: string
    logo?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformOrganization(raw: ParasutMe): Organization {
  const attrs = raw.attributes ?? {}
  return {
    id: raw.id,
    name: attrs.name || undefined,
    legalName: attrs.name || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
