/**
 * Transform Carerix CRDataNode status lists to the canonical Pipeline type.
 *
 * Carerix does not have explicit "pipeline" objects. The closest equivalent
 * is a named set of status DataNodes (CRDataNode) grouped by type — e.g. the
 * publication statuses form an implicit pipeline for vacancies.
 *
 * This transform maps a Carerix DataNode type (nodeType) + its list of nodes
 * (CRDataNode items) to a canonical Pipeline with PipelineStage entries.
 *
 * Carerix CRDataNode field names (JSON API):
 *   dataNodeID, id, name, sortOrder, toType (node type name), dateCreated, dateModified
 *
 * Docs: https://help.carerix.com/en/articles/9470760-rest-api-methods
 */

import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCarerixDataNode {
  dataNodeID?: string | number
  id?: string | number
  name?: string
  sortOrder?: number | string
  toType?: {
    id?: string | number
    name?: string
    [key: string]: unknown
  } | string | null
  dateCreated?: string
  dateModified?: string
  [key: string]: unknown
}

export interface RawCarerixNodeType {
  /** The node type identifier / name (e.g. "publicationStatus"). */
  nodeTypeKey?: string
  id?: string | number
  name?: string
  /** All DataNode items belonging to this type. */
  nodes?: RawCarerixDataNode[]
  dateCreated?: string
  dateModified?: string
  [key: string]: unknown
}

function transformStage(raw: RawCarerixDataNode): PipelineStage {
  const id = raw.dataNodeID ?? raw.id
  const order = raw.sortOrder != null ? parseInt(String(raw.sortOrder), 10) : undefined
  return {
    id: String(id ?? ''),
    name: raw.name ?? String(id ?? ''),
    order: order != null && !isNaN(order) ? order : undefined,
  }
}

export function transformPipeline(raw: RawCarerixNodeType): Pipeline {
  const id = raw.id ?? raw.nodeTypeKey ?? 'unknown'
  return {
    id: String(id),
    name: raw.name ?? String(id),
    stages: (raw.nodes ?? []).map(transformStage),
    created_at: toIsoDatetime(raw.dateCreated),
    updated_at: toIsoDatetime(raw.dateModified),
    metadata: raw as Record<string, unknown>,
  }
}
