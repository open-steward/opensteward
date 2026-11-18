import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Productboard v1 product or component → canonical Project.
 *
 * Products are top-level containers. Components are child containers
 * nested under products. Both map to the canonical Project resource.
 * A token addresses a single workspace with no addressable id, so
 * `workspaceId` is left empty.
 *
 * v1 endpoint shapes:
 *   GET /products  → { data: [ { id, name, description, owner: { email }, links, createdAt, updatedAt } ] }
 *   GET /components → same shape with a parent.product reference
 */
export interface RawProductboardProduct {
  id: string
  name?: string
  description?: string
  owner?: { email?: string } | null
  parent?: {
    product?: { id?: string; name?: string; links?: { self?: string } }
  } | null
  links?: { self?: string; html?: string }
  archived?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(raw: RawProductboardProduct): ProjectStatus {
  if (raw.archived) return 'archived'
  return 'active'
}

export function transformProject(raw: RawProductboardProduct, entityType: 'product' | 'component'): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.owner?.email),
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'productboard',
    metadata: strMap({
      entityType,
      ownerEmail: raw.owner?.email,
      parentProductId: raw.parent?.product?.id,
      parentProductName: raw.parent?.product?.name,
      htmlUrl: raw.links?.html,
    }),
    raw,
  }
}
