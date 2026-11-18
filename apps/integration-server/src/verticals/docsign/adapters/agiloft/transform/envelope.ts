import type { Envelope } from '../../../schema/envelope'

/**
 * RawAgiloftContract — one Contracts-table record as the JSON decorator
 * returns it: a row of EWSearch's `result` array, or EWRead's `result` object.
 *
 * Only two fields are read, both named by first-party docs:
 *   - `id` — "Each set of field values includes the ID" (REST - Search);
 *     `"id":21` in the JSON decorator example (REST Interface).
 *   - `contract_title1` — the Contract Title, as the documented contract
 *     Search reply names it: `{"company_name":"Company_2.","id":32,
 *     "contract_title1":"MASTER SERVICES AGREEMENT"}` (REST - NLPSearch).
 *
 * Agiloft KBs are configurable and the public docs give no logical name for
 * Status, the requester or any date on the Contracts table, so nothing is
 * read for them: the whole record is kept in `raw`.
 */
export interface RawAgiloftContract {
  id: number | string
  contract_title1?: string | null
  [key: string]: unknown
}

export function transformEnvelope(raw: RawAgiloftContract): Envelope {
  if (raw.id === undefined || raw.id === null || String(raw.id) === '') {
    throw new Error('Agiloft contract row has no id')
  }
  const id = String(raw.id)
  // Contract Title is "Required contract title." (Contracts Table, Standard
  // System Documentation), yet "Fields with empty values are returned as
  // nulls" — so a missing title is refused, not replaced.
  const subject = raw.contract_title1
  if (typeof subject !== 'string' || subject === '') {
    throw new Error(`Agiloft contract ${id} has no contract_title1 (Contract Title)`)
  }
  return {
    id,
    externalId: id,
    // The Status field's logical name is not published; see RawAgiloftContract.
    status: 'unknown',
    subject,
    // No signers are read, so there is no order among them to report.
    signingOrder: 'parallel',
    signerIds: [],
    documentIds: [],
    platform: 'agiloft',
    metadata: {},
    raw,
  }
}
