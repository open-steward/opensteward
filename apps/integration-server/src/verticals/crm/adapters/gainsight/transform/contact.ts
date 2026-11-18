/**
 * Transform Gainsight Person object <-> canonical Contact.
 *
 * Read side: the documented "Get Person API with GSID" success response
 * (GET /v1/peoplemgmt/v1.0/people/{gsid}) returns the Person under `data`
 * with LOWERCASE keys, plus a `companies` array of Company Person records:
 *
 *   { "result": true, "requestId": "…", "data": { "email": "jsmith@abc.com",
 *     "createddate": "2018-06-05T12:03:16.417", "firstname": "John",
 *     "modifieddate": "2018-06-05T12:03:16.417", "name": "John Smith",
 *     "lastname": "smith", "gsid": "1P04AB23JMJA97MWFYJM8PQO1KQTAYV5MXJ1",
 *     "companies": [ { "company_id": { "Id": "1P04QNK6…", "name": "abc, Inc." },
 *       "isprimarycompany": null, "title": "Executive Sponsor", … } ] } }
 *
 * Not mapped, with reasons:
 *   - phone: the Person object documents no phone field.
 *   - created_at / updated_at: `createddate` / `modifieddate` carry no offset
 *     and the docs do not state their zone, so an instant cannot be derived
 *     without guessing. The raw values stay in `metadata`.
 *
 * Write side (untransformContact) is unchanged: write methods are out of
 * scope for this rebuild.
 *
 * Docs: https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Person_API/People_API_Documentation
 */
import type { Contact } from '../../../schema/contact'

/** A lookup value in a Company Person record: `{ "Id": "…", "name": "…" }`. */
export interface RawGainsightLookup {
  Id?: string | null
  name?: string | null
}

/** One Company Person record from `data.companies`. */
export interface RawGainsightCompanyPerson {
  gsid?: string | null
  company_id?: RawGainsightLookup | null
  isprimarycompany?: boolean | null
  title?: string | null
  active?: boolean | null
  [key: string]: unknown
}

/** `data` of the documented Get Person response. */
export interface RawGainsightPerson {
  gsid?: string | null
  email?: string | null
  firstname?: string | null
  lastname?: string | null
  name?: string | null
  createddate?: string | null
  modifieddate?: string | null
  companies?: RawGainsightCompanyPerson[] | null
  [key: string]: unknown
}

/**
 * The Company Person record that identifies the contact's company: the one
 * flagged `isprimarycompany` ("contains the primary company of the person"),
 * or the only association when there is exactly one. Several associations
 * with none flagged primary are ambiguous, so none is chosen.
 */
function primaryCompany(raw: RawGainsightPerson): RawGainsightCompanyPerson | undefined {
  const companies = raw.companies ?? []
  const flagged = companies.filter((c) => c.isprimarycompany === true)
  if (flagged.length === 1) return flagged[0]
  if (flagged.length === 0 && companies.length === 1) return companies[0]
  return undefined
}

export function transformContact(raw: RawGainsightPerson): Contact {
  if (!raw.gsid) {
    throw Object.assign(new Error('Gainsight: person record has no gsid'), { statusCode: 502 })
  }
  const company = primaryCompany(raw)
  return {
    id: String(raw.gsid),
    first_name: raw.firstname ?? undefined,
    last_name: raw.lastname ?? undefined,
    name: raw.name ?? undefined,
    email: raw.email ?? undefined,
    title: company?.title ?? undefined,
    company_id: company?.company_id?.Id ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.email !== undefined) out.Email = data.email
  if (data.first_name !== undefined) out.FirstName = data.first_name
  if (data.last_name !== undefined) out.LastName = data.last_name
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.title !== undefined) out.Title = data.title
  return out
}
