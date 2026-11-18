/**
 * cobra `CompanyForDetailedDto` → canonical Company.
 *
 * The `data` of GET /companies/{id} ("Retrieve the details of an existing
 * company by its ID", https://apis.cobra-hilfe.de/api-7858725.md). Only fields
 * that schema declares are read.
 */
import type { Company } from '../../../schema/company'
import { tagTexts, type RawCobraMetaDataItem, type RawCobraTag } from './person'

/** `CompanyPhoneForDetailedDto`. */
interface RawCobraCompanyPhone {
  isFavorite?: boolean | null
  number?: string | null
}

export interface RawCobraCompanyDetail {
  /** "The unique identifier of the entity." */
  id?: string | null
  name?: string | null
  tags?: RawCobraTag[] | null
  /** `EmbeddedIndustrySectorOutputDto`: `text`, `id`. */
  industrySector?: { text?: string | null; id?: string | null } | null
  phoneNumbers?: RawCobraCompanyPhone[] | null
  created?: RawCobraMetaDataItem | null
  modified?: RawCobraMetaDataItem | null
  [key: string]: unknown
}

function str(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

export function transformCompanyDetail(raw: RawCobraCompanyDetail): Company {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('cobra CRM company carried no id')
  }
  // Company.name is required and cobra documents no other name field.
  if (typeof raw.name !== 'string' || raw.name === '') {
    throw new Error(`cobra CRM company ${raw.id} carried no name`)
  }
  return {
    id: raw.id,
    name: raw.name,
    phone: str((raw.phoneNumbers ?? []).find((p) => p.isFavorite === true)?.number),
    industry: str(raw.industrySector?.text),
    tags: tagTexts(raw.tags),
    created_at: str(raw.created?.date),
    updated_at: str(raw.modified?.date),
    metadata: raw,
  }
}
