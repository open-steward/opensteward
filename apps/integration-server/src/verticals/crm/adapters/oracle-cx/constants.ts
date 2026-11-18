/** Oracle CX Sales — shared constants. */

export const ORACLE_CRM_VERSION = 'latest'

/** Default pagination limit for list requests. */
export const DEFAULT_LIMIT = 25

/**
 * Largest `limit` sent upstream. ManageCollections.html: "For most resources,
 * the predefined query limit to retrieve the records is set by default to 500
 * rows or a similar value."
 */
export const MAX_LIMIT = 500

/** Hard-coded synthetic pipeline returned when Oracle CX has no pipeline API. */
export const SYNTHETIC_PIPELINE = {
  id: 'default',
  name: 'Sales Pipeline',
  stages: [
    { id: '01', name: 'Prospecting', order: 1 },
    { id: '02', name: 'Qualification', order: 2 },
    { id: '03', name: 'Proposal', order: 3 },
    { id: '04', name: 'Negotiation', order: 4 },
    { id: '05', name: 'Closing', order: 5 },
  ],
}
