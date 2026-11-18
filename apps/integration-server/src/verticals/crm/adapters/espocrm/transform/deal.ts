import type { Deal } from '../../../schema/deal'
import { espoDateToIso, espoDatetimeToIso } from './datetime'
import { requireString } from './required'

// EspoCRM Opportunity entity (maps to Deal)
export interface RawEspoCrmOpportunity {
  id?: string
  name?: string
  amount?: number | null
  /** spec.json: {"type":"string","enum":["USD","EUR"],"description":"A code."} (the instance's currency list). */
  amountCurrency?: string | null
  probability?: number
  /** spec.json: {"type":"string","enum":["Prospecting","Qualification","Proposal","Negotiation","Closed Won","Closed Lost"]}. */
  stage?: string
  /**
   * The Pipeline and Pipeline Stage link fields that EspoCRM v10.0+ adds when
   * Pipelines are enabled (docs.espocrm.com/general/pipelines/: "After enabling
   * pipelines, the following Link fields are automatically created: Pipeline
   * Pipeline Stage"). A link's id attribute is `{link}Id` (Core/Name/Field.php
   * PIPELINE_STAGE = 'pipelineStage'; Hooks/Common/PipelineStageStatus.php
   * `$entity->get(Field::PIPELINE_STAGE . 'Id')`). These are the ids
   * listPipelines returns.
   */
  pipelineId?: string | null
  pipelineStageId?: string | null
  campaignId?: string
  accountId?: string
  contactId?: string
  assignedUserId?: string
  closeDate?: string
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

export function transformDeal(raw: RawEspoCrmOpportunity): Deal {
  return {
    id: requireString(raw.id, 'Opportunity.id'),
    // spec.json Opportunity_create: "required":["name","amount","amountCurrency","closeDate"].
    title: requireString(raw.name, `Opportunity ${String(raw.id)} name`),
    // Both halves documented on the Opportunity; no currency is assumed.
    value:
      raw.amount != null && typeof raw.amountCurrency === 'string' && raw.amountCurrency !== ''
        ? { amount: raw.amount, currency: raw.amountCurrency }
        : undefined,
    status: raw.stage,
    stage: raw.stage,
    // Only the PipelineStage record id: the stage label is not an id and would
    // never match a stage listPipelines returns.
    stage_id: typeof raw.pipelineStageId === 'string' ? raw.pipelineStageId : undefined,
    pipeline_id: typeof raw.pipelineId === 'string' ? raw.pipelineId : undefined,
    company_id: raw.accountId,
    contact_ids: raw.contactId != null ? [String(raw.contactId)] : undefined,
    owner_id: raw.assignedUserId,
    close_date: espoDateToIso(raw.closeDate),
    created_at: espoDatetimeToIso(raw.createdAt),
    updated_at: espoDatetimeToIso(raw.modifiedAt),
    metadata: raw,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.name = data.title
  if (data.value?.amount !== undefined) out.amount = data.value.amount
  if (data.status !== undefined) out.stage = data.status
  if (data.company_id !== undefined) out.accountId = data.company_id
  if (data.contact_ids?.[0] !== undefined) out.contactId = data.contact_ids[0]
  if (data.close_date !== undefined) out.closeDate = data.close_date
  return out
}
