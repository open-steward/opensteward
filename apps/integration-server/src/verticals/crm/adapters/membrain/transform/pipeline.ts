import type { Pipeline } from '../../../schema/pipeline'
import { required } from '../fields'

/**
 * A Sales Process as GET /salesProcesses/ returns it
 * (https://www.membrain.com/developers/api-documentation): "Stages: A list of
 * all the Stages in the Sales Process, if any. Every stage can then contain 0
 * or more Steps. Each Stage and Step has an Id and a Name."
 */
export interface RawMembrainPipeline {
  Id: string
  Name: string
  Stages?: Array<{ Id: string; Name: string; Steps?: unknown[] }>
  [key: string]: unknown
}

export function transformPipeline(raw: RawMembrainPipeline): Pipeline {
  return {
    id: required(raw.Id, 'Id', 'sales process'),
    name: required(raw.Name, 'Name', 'sales process'),
    stages: raw.Stages?.map((s) => ({
      id: required(s.Id, 'Stage Id', 'sales process'),
      name: required(s.Name, 'Stage Name', 'sales process'),
    })),
    metadata: raw,
  }
}
