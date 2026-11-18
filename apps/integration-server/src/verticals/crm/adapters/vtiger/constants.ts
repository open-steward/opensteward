/** Vtiger CRM — shared constants. */

/** Default pagination limit for query operations. */
export const DEFAULT_LIMIT = 25

/** Hard-coded synthetic pipeline (Vtiger has no pipeline module). */
export const SYNTHETIC_PIPELINE = {
  id: 'default',
  name: 'Sales Pipeline',
  stages: [
    { id: 's1', name: 'Prospecting', order: 1 },
    { id: 's2', name: 'Qualification', order: 2 },
    { id: 's3', name: 'Needs Analysis', order: 3 },
    { id: 's4', name: 'Value Proposition', order: 4 },
    { id: 's5', name: 'Proposal/Price Quote', order: 5 },
    { id: 's6', name: 'Negotiation/Review', order: 6 },
    { id: 's7', name: 'Closed Won', order: 7 },
    { id: 's8', name: 'Closed Lost', order: 8 },
  ],
}

/**
 * Most rows one VTQL query returns: "Query always limits its output to 100
 * records" (community.vtiger.com third-party-app-integration).
 */
export const MAX_QUERY_LIMIT = 100
