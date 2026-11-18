export const HL_DEFAULT_LIMIT = 25
/** GET /contacts/ and GET /opportunities/search: "will allow maximum up to 100". */
export const HL_MAX_PAGE_SIZE = 100

/** HighLevel webhook event type strings */
export const HL_WEBHOOK_TYPES = {
  CONTACT_CREATE: 'ContactCreate',
  CONTACT_UPDATE: 'ContactUpdate',
  CONTACT_DELETE: 'ContactDelete',
  OPPORTUNITY_CREATE: 'OpportunityCreate',
  OPPORTUNITY_UPDATE: 'OpportunityUpdate',
  OPPORTUNITY_DELETE: 'OpportunityDelete',
} as const
