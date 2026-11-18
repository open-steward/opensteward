export const OAUTH_AUTH_URL = 'https://login.salesforce.com/services/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token'
export const API_VERSION = 'v60.0'

/**
 * Valid range for the `Sforce-Query-Options: batchSize=N` header, which
 * controls how many rows one `query`/`queryNext` response carries. It is not
 * the caller's page size: the row pager cuts pages of the caller's `limit` out
 * of these batches (see `listSoqlRows` in index.ts). Salesforce rejects a
 * value outside 200-2000 outright.
 */
export const MIN_QUERY_BATCH_SIZE = 200
export const MAX_QUERY_BATCH_SIZE = 2000

/**
 * sObject id key prefixes, used to route activity CRUD to Task or Event
 * without a lookup — Salesforce ids embed the object type in the first 3
 * characters.
 */
export const TASK_ID_PREFIX = '00T'
export const EVENT_ID_PREFIX = '00U'

/**
 * WhatId is polymorphic (Opportunity, Account, Case, custom objects, ...).
 * Only an id with this prefix maps to `deal_id` — everything else would
 * point a deal link at a record that is not a Deal.
 */
export const OPPORTUNITY_ID_PREFIX = '006'
