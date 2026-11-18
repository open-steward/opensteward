/**
 * ChurnZero pipeline transform stub.
 *
 * ChurnZero does not expose a Pipeline resource through its REST API.
 * The platform tracks account health and churn risk rather than sales
 * pipelines.
 *
 * This stub is kept for structural consistency. The ChurnzeroAdapter does
 * NOT implement pipeline methods — the registry returns HTTP 501 automatically.
 */
import type { Pipeline } from '../../../schema/pipeline'

export interface RawChurnZeroPipeline {
  id: string | number
  name?: string
  [key: string]: unknown
}

export function transformPipeline(raw: RawChurnZeroPipeline): Pipeline {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    metadata: raw as Record<string, unknown>,
  }
}
