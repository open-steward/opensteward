import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import type { MondayBoard } from '../client'

interface StatusLabels {
  labels?: Record<string, string>
}

export function transformPipeline(raw: MondayBoard): Pipeline {
  // Find the first `color` (status) column — that holds the stage labels
  const statusColumn = raw.columns.find((c) => c.type === 'color')

  let stages: PipelineStage[] = []
  if (statusColumn?.settings_str) {
    try {
      const settings = JSON.parse(statusColumn.settings_str) as StatusLabels
      if (settings.labels) {
        stages = Object.entries(settings.labels).map(([indexStr, label], position) => ({
          id: indexStr,
          name: label,
          order: position,
        }))
      }
    } catch {
      // malformed settings_str — leave stages empty
    }
  }

  return {
    id: raw.id,
    name: raw.name,
    stages,
    is_active: true,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
