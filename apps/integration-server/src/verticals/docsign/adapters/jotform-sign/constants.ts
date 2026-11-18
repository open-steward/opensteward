/**
 * Jotform / Jotform Sign REST API constants.
 *
 * Jotform Sign documents are modelled on top of Jotform's core forms +
 * submissions API: a Sign document is a form whose `type` is `SIGN`, and each
 * person who signs produces a submission against that form. There is no
 * dedicated "/sign" REST surface, so the adapter reads the documented forms
 * and submissions endpoints and filters to the SIGN type.
 *
 * Authentication is a static API key sent in the `APIKEY` request header
 * (the query-param form `?apiKey=` is also accepted by the API but the header
 * keeps the key out of logs). There is no OAuth Authorization-Code flow for
 * server-to-server use, so the adapter collects the key — plus the data region
 * that selects the API host — through the Connect Link credential form.
 *
 * Docs: https://api.jotform.com/docs/
 * Auth: https://api.jotform.com/docs/#authentication
 */
export const API_BASE_URL = 'https://api.jotform.com'

/** Region slug → API host. The credential form offers these as a closed set. */
export const REGION_BASE_URLS: Record<string, string> = {
  us: 'https://api.jotform.com',
  eu: 'https://eu-api.jotform.com',
  hipaa: 'https://hipaa-api.jotform.com',
}

/**
 * Jotform list endpoints page with `offset` + `limit`. The documented hard
 * ceiling is 1000 rows per call; we default to 100 to stay friendly to the
 * daily API-call quota (`limit-left` in the response envelope).
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

/** Jotform Sign documents are forms whose `type` field equals this value. */
export const SIGN_FORM_TYPE = 'SIGN'
