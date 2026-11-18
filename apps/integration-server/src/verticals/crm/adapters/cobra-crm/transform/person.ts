/**
 * cobra People360 people → canonical Contact.
 *
 * Two documented shapes:
 *   - `PeopleList`, the rows of GET /people ("Retrieve a list of people",
 *     https://apis.cobra-hilfe.de/api-7858747.md);
 *   - `PeopleWithResponsibleForObjects`, the `data` of GET /people/{id}
 *     ("Retrieve a person", https://apis.cobra-hilfe.de/api-7858749.md).
 * Only fields those schemas declare are read.
 */
import type { Contact } from '../../../schema/contact'

/** `PeopleList` (api-7858747). */
export interface RawCobraPeopleListItem {
  id?: string | null
  firstname?: string | null
  lastname?: string | null
  /** "The name of the business from the person, associated with favorite businesscard." */
  businessName?: string | null
  /** "The position/title of the person, associated with favorite businesscard." */
  position?: string | null
  lifecycleText?: string | null
  /** "The email address of the person, associated with favorite businesscard." */
  email?: string | null
  /** 'Combination field: "Lastname, Firstname"' */
  name?: string | null
  [key: string]: unknown
}

/** `MetaDataItem`: "The date when the interaction occurred." */
export interface RawCobraMetaDataItem {
  date?: string | null
  userId?: string | null
  [key: string]: unknown
}

/** `CobraTagForEmbeddedDto`. */
export interface RawCobraTag {
  id?: string | null
  text?: string | null
}

interface RawCobraPeopleEmail {
  isFavorite?: boolean | null
  mail?: string | null
}

interface RawCobraPeoplePhone {
  isFavorite?: boolean | null
  type?: string | null
  /** "The phone number, formatted in E.164." */
  number?: string | null
}

interface RawCobraBusinessPosition {
  position?: string | null
  isFavorite?: boolean | null
}

/** `BusinessCard` (api-7858749). */
interface RawCobraBusinessCard {
  id?: string | null
  /** "The ID of the related company." */
  companyId?: string | null
  phones?: RawCobraPeoplePhone[] | null
  emails?: RawCobraPeopleEmail[] | null
  businessPositions?: RawCobraBusinessPosition[] | null
  /** "Specifies whether the business card is marked as favorite." */
  isFavorite?: boolean | null
}

/** `PeopleWithResponsibleForObjects` (api-7858749). */
export interface RawCobraPerson {
  id?: string | null
  firstname?: string | null
  lastname?: string | null
  name?: string | null
  tags?: RawCobraTag[] | null
  cards?: RawCobraBusinessCard[] | null
  lifecycle?: { text?: string | null } | null
  created?: RawCobraMetaDataItem | null
  modified?: RawCobraMetaDataItem | null
  [key: string]: unknown
}

function requireId(id: string | null | undefined, what: string): string {
  if (typeof id !== 'string' || id === '') {
    throw new Error(`cobra CRM ${what} carried no id`)
  }
  return id
}

function str(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function favorite<T extends { isFavorite?: boolean | null }>(
  items: T[] | null | undefined,
): T | undefined {
  return (items ?? []).find((item) => item.isFavorite === true)
}

export function tagTexts(tags: RawCobraTag[] | null | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags.map((t) => t.text).filter((t): t is string => typeof t === 'string' && t !== '')
}

/** One row of GET /people. */
export function transformPeopleListItem(raw: RawCobraPeopleListItem): Contact {
  return {
    id: requireId(raw.id, 'person'),
    first_name: str(raw.firstname),
    last_name: str(raw.lastname),
    name: str(raw.name),
    email: str(raw.email),
    title: str(raw.position),
    stage: str(raw.lifecycleText),
    metadata: raw,
  }
}

/**
 * GET /people/{id}. Email, phone, position and company come from the favorite
 * business card, the card the list endpoint's flat fields are "associated
 * with"; within it, the favorite email, phone and position.
 */
export function transformPerson(raw: RawCobraPerson): Contact {
  const card = favorite(raw.cards)
  return {
    id: requireId(raw.id, 'person'),
    first_name: str(raw.firstname),
    last_name: str(raw.lastname),
    name: str(raw.name),
    email: str(favorite(card?.emails)?.mail),
    phone: str(favorite(card?.phones)?.number),
    title: str(favorite(card?.businessPositions)?.position),
    company_id: str(card?.companyId),
    stage: str(raw.lifecycle?.text),
    tags: tagTexts(raw.tags),
    created_at: str(raw.created?.date),
    updated_at: str(raw.modified?.date),
    metadata: raw,
  }
}
