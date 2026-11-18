/**
 * lemlist Campaign → Pipeline transform.
 *
 * lemlist does not have a native "pipeline" concept, but campaigns fulfil
 * a structurally equivalent role (a named sequence/funnel leads move through).
 * We surface them as read-only Pipeline objects.
 *
 * lemlist /campaigns response item:
 *   _id, name, labels?
 */

import type { Pipeline } from '../../../schema/pipeline'

export interface RawLemlistCampaign {
  _id: string
  name?: string
  labels?: string[]
  [key: string]: unknown
}

export function transformCampaignAsPipeline(raw: RawLemlistCampaign): Pipeline {
  return {
    id: String(raw._id),
    name: raw.name ?? '',
    metadata: raw as unknown as Record<string, unknown>,
  }
}
