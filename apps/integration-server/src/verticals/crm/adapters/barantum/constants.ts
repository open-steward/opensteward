// Barantum CRM — Indonesia/SE Asia omnichannel CRM & Call Center
// Website: https://www.barantum.com
// Docs: https://docs.barantum.com/api/collections/23513668/2sBYAuTBr5 (Postman collection)
//
// The CRM API, per the collection's "Barantum CRM" folder: "All CRM
// operations use 4 unified REST endpoints. The target module is specified via
// the module parameter in the request body. Authentication is done by passing
// a JWT token in the token field of each request body." Reads go to
// POST https://rest-api.barantum.com/api/get_list_data. The JWT comes from
// POST https://rest-api.barantum.com/api/login ("copy the token from the
// result that will be used for hitting the Barantum Public API").

export const CRM_BASE_URL = 'https://rest-api.barantum.com/api'

/**
 * Rows per `get_list_data` page. The request takes only `page` ("page |
 * Optional | number | 1"); there is no size parameter, and every documented
 * response shows `"per_page": 20`.
 */
export const UPSTREAM_PAGE_SIZE = 20

/**
 * The host the write methods (createContact, createCompany, createDeal,
 * createActivity, createNote) still call. It appears nowhere in Barantum's
 * docs and does not resolve; the read rebuild left the write methods alone.
 */
export const LEGACY_BASE_URL = 'https://app.barantum.com/api/v1'
