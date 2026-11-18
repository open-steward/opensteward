// Decklar (formerly Roambee) API, https://docs.decklar.com/ (Redoc, spec
// embedded in the page). servers: "https://api.decklar.com" "Production
// environment" (also staging and "https://api.roambee.de" "DE environment";
// this adapter has no region key, so it uses production). The spec's info
// block: "All existing endpoints (with *.roambee.com) will continue to
// function as before." Paths are rooted at the host (/v2/shipment,
// /shipment/alerts), so the base carries no path.
export const ROAMBEE_API_BASE = 'https://api.decklar.com/'
export const ROAMBEE_DASHBOARD_URL = 'https://app.roambee.com/'
// "API calling limit: * 5 requests in 1 sec * Maximum 10k API requests per day."
export const RATE_LIMIT_RPS = 5

// GET /v2/shipment `$size`: "This specifies result count. If not specified by
// default it will return 10 records. Maximum value can be 100."
export const MAX_SHIPMENT_PAGE_SIZE = 100
// The documented default page of that list. listTrackingEvents fans out one
// POST /shipment/alerts per shipment, so it walks shipments in pages of this
// size: each upstream step is at most 11 sequential requests (1 GET + 10
// POSTs). Nothing paces them, so a step can exceed the documented 5 req/s;
// the client only backs off after a 429. Each step also spends up to 11 of
// the documented 10k requests per day.
export const EVENT_PARENT_PAGE_SIZE = 10
