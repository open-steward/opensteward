import type { Deal } from '../../../schema/deal'
import {
  integer,
  positiveId,
  primaryKey,
  requireId,
  text,
  utcTimestamp,
  zonedTimestamp,
} from '../values'

/**
 * GET /api/v1/Sale/{id} returns SuperOffice.CRM.Services.SaleEntity
 * (openapi-v3-Sale.json). Fields read:
 *   SaleId "Primary key", Heading "Sale heading (short description?)",
 *   Status "The state of the Sale: Open / Sold / Lost / Stalled",
 *   Rating (Id "The List Item Id", Value "The List Item Value"; the Rating carrier is
 *   "Sale Stage with probability percent."), SaleType (Id),
 *   Contact (ContactId), Person (PersonId), Associate (AssociateId),
 *   Saledate "(expected / lost / won) sales date",
 *   Probability "Actual probability, may differ from the one in the list",
 *   CreatedDate "Registered date in UTC.", UpdatedDate "Last updated in UTC."
 *
 * No `value`: Amount is documented ("Total sale amount") but its Currency is
 * a list item whose Value is "The List Item Value", not an ISO 4217 code.
 */
export interface RawSuperofficeSale {
  SaleId?: number
  Heading?: string
  Status?: string
  Rating?: { Id?: number; Value?: string } | null
  SaleType?: { Id?: number } | null
  Contact?: { ContactId?: number } | null
  Person?: { PersonId?: number } | null
  Associate?: { AssociateId?: number } | null
  Saledate?: string
  Probability?: number
  CreatedDate?: string
  UpdatedDate?: string
  [key: string]: unknown
}

function probability(value: unknown): number | undefined {
  const n = integer(value)
  return n !== undefined && n >= 0 && n <= 100 ? n : undefined
}

export function transformDeal(raw: RawSuperofficeSale): Deal {
  const id = requireId(raw.SaleId, 'sale')
  if (typeof raw.Heading !== 'string') throw new Error(`SuperOffice sale ${id} has no Heading`)
  const personId = positiveId(raw.Person?.PersonId)
  return {
    id,
    title: raw.Heading,
    status: text(raw.Status),
    stage: text(raw.Rating?.Value),
    stage_id: positiveId(raw.Rating?.Id),
    pipeline_id: positiveId(raw.SaleType?.Id),
    contact_ids: personId !== undefined ? [personId] : undefined,
    company_id: positiveId(raw.Contact?.ContactId),
    owner_id: positiveId(raw.Associate?.AssociateId),
    close_date: zonedTimestamp(raw.Saledate),
    probability: probability(raw.Probability),
    created_at: utcTimestamp(raw.CreatedDate),
    updated_at: utcTimestamp(raw.UpdatedDate),
    metadata: raw,
  }
}

/**
 * The columns GET /api/v1/Sale selects. That operation "Calls the Archive
 * service using the "FindSale" archive."; its columns, from
 * https://docs.superoffice.com/en/api/archive-providers/reference/findsale:
 *   heading        stringorPK "Sale: The name of the sale"
 *   saleStatus     listAny "Status: The status of the sale - open, lost or sold"
 *   stageName      "Stage name: Displays the stage of the sale"
 *   saleTypeId     "Sale type ID: Sale type, from list"
 *   probPercent    int "Probability as %: Probability as %"
 *   date           date "Date: Displays start date of a follow-up / sale date of a sale"
 *   registeredDate date "Registered date: The date/time the data was registered in UTC."
 *   updatedDate    date "Updated: The date/time the data was last updated in UTC."
 */
export const SALE_COLUMNS = [
  'heading',
  'saleStatus',
  'stageName',
  'saleTypeId',
  'probPercent',
  'date',
  'registeredDate',
  'updatedDate',
] as const

export function transformDealRow(row: Record<string, unknown>): Deal {
  const id = primaryKey(row, 'sale')
  const title = text(row['heading'])
  if (title === undefined) throw new Error(`SuperOffice sale row ${id} has no heading`)
  return {
    id,
    title,
    status: text(row['saleStatus']),
    stage: text(row['stageName']),
    pipeline_id: positiveId(row['saleTypeId']),
    probability: probability(row['probPercent']),
    close_date: zonedTimestamp(row['date']),
    created_at: utcTimestamp(row['registeredDate']),
    updated_at: utcTimestamp(row['updatedDate']),
    metadata: row,
  }
}

export function untransformDeal(data: Partial<Deal>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.title !== undefined) out.Heading = data.title
  if (data.value?.amount !== undefined) out.Amount = data.value.amount
  if (data.status !== undefined) out.Status = data.status
  if (data.stage_id !== undefined) out.SaleStage = { SaleStageId: Number(data.stage_id) }
  if (data.company_id !== undefined) out.Contact = { ContactId: Number(data.company_id) }
  if (data.owner_id !== undefined) out.Associate = { AssociateId: Number(data.owner_id) }
  if (data.close_date !== undefined) out.SaleDate = data.close_date
  return out
}
