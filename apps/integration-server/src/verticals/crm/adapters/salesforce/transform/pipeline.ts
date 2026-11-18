import type { Pipeline, PipelineStage } from '../../../schema/pipeline'

export interface RawSalesforcePicklistValue {
  value: string
  label?: string
  active?: boolean
  defaultValue?: boolean
}

export function transformPipeline(
  picklistValues: RawSalesforcePicklistValue[],
): Pipeline {
  const activeValues = picklistValues.filter((p) => p.active !== false)
  const stages: PipelineStage[] = activeValues.map((p, index) => ({
    id: p.value,
    name: p.label ?? p.value,
    order: index,
  }))

  return {
    id: 'default',
    name: 'Sales Pipeline',
    stages,
    is_active: true,
    metadata: { picklistValues },
  }
}
