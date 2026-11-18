import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

/**
 * Bigin Team Pipelines are the layouts of the Pipelines module, returned by
 * GET /settings/layouts?module=Pipelines
 * (https://www.bigin.com/developer/docs/apis/v2/layouts-meta-data.html).
 * Deals carry the same id in `Pipeline.id`
 * (https://www.bigin.com/developer/docs/apis/v2/get-team-pipeline-records.html:
 * "You can get the pipeline ID from the Layouts Metadata API by accessing the
 * id value of a Team Pipeline.").
 *
 * Only the fields read here are typed, from that page's response object and
 * sample response.
 */
export interface RawBiginPicklistValue {
  id: string
  display_value: string
  sequence_number?: number
  probability?: number
  [key: string]: unknown
}

export interface RawBiginLayoutField {
  api_name?: string
  pick_list_values?: RawBiginPicklistValue[]
  [key: string]: unknown
}

export interface RawBiginLayout {
  /** "The unique identifier of the layout." */
  id: string
  /** "The display label or name assigned to the layout." */
  display_label: string
  /** "Indicates the date and time (ISO8601) when the current layout was created." Null in the documented sample. */
  created_time?: string | null
  /** "Indicates the date and time (ISO8601) when the layout was last modified." */
  modified_time?: string | null
  /** "Lists the sections within the layout." */
  sections?: Array<{ fields?: RawBiginLayoutField[]; [key: string]: unknown }>
  [key: string]: unknown
}

/**
 * The layout's `Stage` picklist lists every stage of the Team Pipeline, across
 * its sub-pipelines, each with `sequence_number` and `probability`.
 */
function stagesOf(raw: RawBiginLayout): PipelineStage[] | undefined {
  const field = (raw.sections ?? [])
    .flatMap((s) => s.fields ?? [])
    .find((f) => f.api_name === 'Stage')
  if (!field?.pick_list_values) return undefined
  // Values without a sequence_number (none in the documented sample) sort
  // after every numbered value and keep their array order: a total order.
  const rank = (v: RawBiginPicklistValue): number =>
    typeof v.sequence_number === 'number' ? v.sequence_number : Number.POSITIVE_INFINITY
  const values = [...field.pick_list_values].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    return ra === rb ? 0 : ra < rb ? -1 : 1
  })
  return values.map((v, i) => {
    const stage: PipelineStage = { id: String(v.id), name: v.display_value, order: i }
    if (typeof v.probability === 'number') stage.win_probability = v.probability
    return stage
  })
}

export function transformPipeline(raw: RawBiginLayout): Pipeline {
  const out: Pipeline = {
    id: String(raw.id),
    name: raw.display_label,
    metadata: raw,
  }
  const stages = stagesOf(raw)
  if (stages) out.stages = stages
  if (raw.created_time) out.created_at = raw.created_time
  if (raw.modified_time) out.updated_at = raw.modified_time
  return out
}
