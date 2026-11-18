/**
 * Fixtures from the first-party CRM API v4 page,
 * https://support.reallysimplesystems.com/api-v4/ ("Examples" tab).
 *
 * ACCOUNT_RECORD is the `record` of the "GET Your Accounts" example verbatim.
 * The page documents no field list for contacts or activities, only that every
 * record type is read through the same `{ metadata, list: [{ metadata, record }] }`
 * envelope and addressed by id ("GET /{object_name}/12345 Above will return the
 * record which has the ID of 12345"), so those fixtures carry `id` only.
 */

export const ACCOUNT_RECORD = {
  id: 95920978,
  name: 'test',
  addressline: null,
  addresscity: '',
  'addresscounty/state': '',
  'addresspostcode/zip': '',
  addresscountry: '',
  ownerid: 90505,
  source: '',
  notes: null,
  phone: null,
  website: null,
  type: null,
  sector: null,
  createddate: '2018-09-17 11:29:59',
  modifieddate: '2018-09-17 11:29:59',
}

/** The "Create a New Account" example's response record, verbatim. */
export const CREATED_ACCOUNT_RECORD = {
  id: 95950731,
  name: 'testing API',
  addressline: null,
  addresscity: '',
  'addresscounty/state': '',
  'addresspostcode/zip': '',
  addresscountry: 'United Kingdom',
  ownerid: 90505,
  campaignid: 0,
  source: '',
  notes: null,
  slaid: 125357,
  phone: null,
  website: null,
  type: null,
  sector: null,
  createddate: '2018-09-27 08:48:22',
  modifieddate: '2018-09-27 08:48:22',
}

/** The documented per-record list metadata, for record `id` of `object`. */
export function recordMetadata(object: string, id: number, recordType?: string) {
  return {
    url: `/${object}/${id}`,
    list_url: `/${object}`,
    parent: '/',
    object_type: 'record',
    ...(recordType !== undefined ? { record_type: recordType } : {}),
  }
}
