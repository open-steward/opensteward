/**
 * BaseAdapter — shared interface for all integration platform adapters.
 *
 * Every vertical (accounting, logistics, ecommerce, etc.) extends this
 * interface with domain-specific resource methods.
 *
 * Auth methods are required. Webhook methods are optional.
 */
import type { Credentials } from '../auth/store'

export type QueryParams = {
  page?: number
  limit?: number
  updatedAfter?: Date
  search?: string
  [key: string]: unknown
}

/**
 * Form-field descriptor for the hosted Connect page when an adapter
 * collects credentials directly (api_key, basic, session, oauth2_cc).
 *
 * Adapters that opt into the Connect Link flow expose `credentialFields()`
 * + `exchangeCredentials()` (see `BaseAdapter`). The hosted page renders
 * one input per field; the values are submitted as a flat `Record<string,
 * string>` to `exchangeCredentials()`.
 */
export interface CredentialField {
  /** Field name — sent in the submitted record. */
  name: string
  /** Human-readable label shown above the input. */
  label: string
  /** Input control. `password` masks the value; `url` / `email` apply HTML5
   *  validation; `select` renders a closed-set dropdown using `options`. */
  type: 'text' | 'password' | 'url' | 'email' | 'select'
  placeholder?: string
  /** Caption shown under the input. Surface "where do I find this?" instructions here. */
  helpText?: string
  required?: boolean
  /** For `type: 'select'` — closed set of values the customer picks from. */
  options?: ReadonlyArray<{ value: string; label: string }>
}

/**
 * Optional capabilities an adapter declares about itself.
 *
 * Declared rather than inferred because the router cannot tell an adapter that
 * ignored a parameter from one that honoured it and found nothing. `search`
 * was accepted on every list endpoint and acted on by 54 of 1,547 adapters,
 * which is indistinguishable from a working filter that matched no rows.
 *
 * A silent no-op is the defect; partial support is not. An adapter that has
 * not declared a capability refuses the parameter with a typed error, so the
 * gap is discoverable instead of invisible.
 */
export interface AdapterCapabilities {
  /** Adapter honours `params.search` — i.e. it actually reaches upstream or
   *  filters, rather than dropping the term. */
  search?: boolean
  /**
   * Largest `limit` the platform will accept on a list request.
   *
   * The sync worker's default page size is 500, which several platforms
   * reject outright — HubSpot answers `400 VALIDATION_ERROR: "You can only
   * request at most 100 objects in one request."` and the whole job fails.
   *
   * Declared rather than discovered, because the failure this prevents is not
   * the 400. Clamping the request alone would be worse: the worker decides a
   * collection is complete when a page comes back SHORTER than the size it
   * asked for, so a silently-capped 100 against a requested 500 reads as the
   * last page. The sync would stop after 100 records and mark the collection
   * complete, which then makes the cache serve a truncated collection as
   * authoritative. A loud 400 is better than that, so the ceiling has to reach
   * the worker's termination test, not just the query string.
   *
   * The API path reads it too: `parseListQuery(request.query, adapter)` caps
   * the caller's `limit` at it, so `meta.limit`, `meta.hasMore` and the
   * cache's completeness test all judge a page against the size it was really
   * asked for. Undeclared, a platform that caps at 50 answered the default
   * limit of 100 with 50 rows, `hasMore: false`, and a cache that stored them
   * as the whole collection. Callers see the declaration: a request for 500
   * rows from a platform that declares 250 is served, and reported, as 250.
   *
   * It is one number for the whole adapter. A list method whose endpoint
   * allows fewer rows than this reports the size it sent, with
   * `reportUpstreamPage(params, { pageSize })`, or the same short-page
   * misreading returns for that resource. `check:paging-contract` measures
   * the size each list method sends at the router's largest limit and fails
   * one that sends less than the router asks for without saying so, unless it
   * is banked. Only a finite integer ≥ 1 counts; see `declaredPageMax`.
   *
   * Declaring it is also a promise about EVERY list method of the adapter: a
   * page shorter than the size asked for is the last one. The worker then
   * treats a short page as a proven end — it vouches for the collection and
   * removes cached rows the sync did not return. So a list method whose page
   * is not one upstream page of its own rows must report `hasMore` itself
   * (`reportUpstreamPage`): rows flattened from a page of parents (refunds from
   * orders), or rows dropped client-side. Otherwise 50 orders holding 3 refunds
   * reads as the end, and every cached refund past them is removed.
   *
   * The same promise rules out paging that makes a short or missing page which
   * is not the end: each list method pages at the size requested (clamped to
   * this maximum) from the first row, or reports its own end with
   * `reportUpstreamPage(params, { hasMore })`, or refuses before sending
   * anything (`statusCode: 501, code: 'NOT_SUPPORTED'`) when the platform
   * cannot list the resource at all — the sync then skips that resource
   * without charging the circuit breaker, and the API answers 501. A constant
   * page size (25 rows under a declared 100 ends the collection after 25, even
   * with `page` ignored) or a first page that starts one page in (the first
   * page is never written, yet the collection is marked complete) breaks it.
   * `check:paging-contract` fails any such method on an adapter that declares
   * this, with no baseline to bank it in.
   */
  maxPageSize?: number
  /**
   * Platform refuses an authorization-code request without PKCE (RFC 7636).
   *
   * Declared because the failure is mute. ShipBob's IdentityServer rejects the
   * authorize request outright and redirects to
   * `auth.shipbob.com/home/error?errorId=…`, which names no cause — there is
   * no `error=invalid_request` on a callback to read, because the flow never
   * reaches a callback. Nothing distinguishes it from a bad client_id or an
   * unregistered redirect_uri without reading the provider's docs.
   *
   * When true the connect flow mints a verifier/challenge pair, sends the
   * challenge to the authorize endpoint and replays the verifier at token
   * exchange. When absent, neither parameter is sent and the flow is byte-for-
   * byte what it was — PKCE is additive, but some providers reject unexpected
   * parameters, so it is not applied by default.
   */
  requiresPkce?: boolean
  /**
   * Platform runs a separate sandbox/staging OAuth environment, selectable via
   * a `sandbox` config flag.
   *
   * Declared so the admin UI shows the toggle on the platforms that have one
   * and not on the 1,546 that do not. It is also the only hint an operator
   * gets: choosing the wrong environment fails with the provider's own error
   * page, which for ShipBob names no cause and is byte-identical to the page
   * shown for a bad redirect_uri.
   */
  supportsSandbox?: boolean
}

export interface BaseAdapter {
  /** Unique platform slug (e.g. 'xero', 'fedex') */
  readonly platform: string
  /** Adapter version */
  readonly version: string
  /** What this adapter can do beyond the baseline. See {@link AdapterCapabilities}. */
  readonly capabilities?: AdapterCapabilities

  // ── Auth (required) ───────────────────────────────────────────────────────

  /** Build the OAuth authorization URL for the platform.
   *  @param state CSRF state token to round-trip via the OAuth callback.
   *  @param overrideScopes Optional per-call scope override. When provided,
   *    the adapter MUST use these scopes in the URL instead of its
   *    instance-config default. Adapters that don't support per-call
   *    overrides may ignore this param — callers fall back to the
   *    platform-default behavior in that case.
   *  @param codeChallenge PKCE S256 challenge, supplied only when the adapter
   *    declares `capabilities.requiresPkce`. Adapters that do not are never
   *    passed one and need not accept it.
   *  @param inputs The values collected for this adapter's `oauthFields`,
   *    supplied only when it declares some. Adapters that do not are never
   *    passed any and need not accept them. */
  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string

  /** Exchange an authorization code for credentials */
  exchangeCode(code: string, redirectUri: string): Promise<Credentials>

  /**
   * Exchange an authorization code when the flow used PKCE.
   *
   * Separate from `exchangeCode` rather than a third parameter on it: that
   * slot is already taken, by two different conventions — `extra?:
   * Record<string, string>` (Silverfin's `firm_id`) and a bare `string`
   * (QuickBooks' `realmId`, Medius' `tenant`). Widening it to fit a verifier
   * would break whichever adapters it did not match, to no purpose, since
   * only adapters declaring `requiresPkce` need this at all.
   *
   * Implemented only by those adapters. The callback prefers it whenever a
   * verifier is in flight and falls back to `exchangeCode` otherwise, so
   * every other adapter's exchange is untouched.
   */
  exchangeCodeWithVerifier?(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<Credentials>

  /**
   * Exchange an authorization code on a platform whose token request must
   * repeat the authorize scopes (Faire: "This list must match the previously
   * provided scope parameter").
   *
   * Separate from `exchangeCode` for the reason `exchangeCodeWithVerifier` is:
   * its third slot already means `realmId`, `tenant` or `extra` to other
   * adapters, and a scope array landing there would break them. When an
   * adapter implements this, the OAuth callback calls it (unless inputs or a
   * PKCE verifier are in flight), passing the scope override `getAuthUrl`
   * received at authorize, or `undefined` when there was none — the adapter
   * then uses its configured scopes, as its `getAuthUrl` did.
   */
  exchangeCodeWithScopes?(
    code: string,
    redirectUri: string,
    grantedScopes?: string[],
  ): Promise<Credentials>

  /** Refresh expired credentials */
  refreshCredentials(credentials: Credentials): Promise<Credentials>

  // ── Direct credential entry (optional) ────────────────────────────────────
  //
  // Adapters whose `auth_type` is not `oauth2` (api_key, basic, session,
  // oauth2_cc, …) opt into the Connect Link flow by declaring the form
  // shape they accept and exchanging a typed `fields` map for credentials.
  // OAuth-only adapters leave both undefined.

  /** Form schema for the hosted Connect page when this adapter doesn't use OAuth. */
  credentialFields?(): CredentialField[]

  /** Validate + persist credentials submitted via the Connect Link form. */
  exchangeCredentials?(fields: Record<string, string>): Promise<Credentials>

  // ── Per-customer OAuth inputs (optional) ──────────────────────────────────
  //
  // OAuth adapters whose authorize and token endpoints live on a per-customer
  // host (Shopify `{shop}.myshopify.com`, Zendesk `{subdomain}.zendesk.com`)
  // cannot build an authorize URL from deployment config alone. They declare
  // the non-secret inputs they need; the Connect page renders them for OAuth
  // tiles, the start routes hand them to `getAuthUrl` and park them in pending
  // state keyed by `state`, the callback replays them at token exchange and
  // persists them into `credentials.extra` so the API client can read them.
  // Adapters whose authorize URL is the same for every customer leave both
  // undefined and nothing about their flow changes.

  /** Inputs to collect BEFORE the OAuth redirect. Non-secret: they are stored in `credentials.extra`. */
  oauthFields?(): CredentialField[]

  /**
   * Exchange an authorization code when the flow collected `oauthFields`.
   *
   * Separate from `exchangeCode` for the reason `exchangeCodeWithVerifier`
   * is: that method's third slot is already contested. Receives the PKCE
   * verifier too, so an adapter that needs both does not need a fourth
   * method. The callback prefers this whenever inputs are in flight.
   */
  exchangeCodeWithInputs?(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
    codeVerifier?: string | null,
  ): Promise<Credentials>

  // ── Webhooks (optional) ───────────────────────────────────────────────────

  /**
   * Verify the authenticity of an incoming webhook request.
   *
   * @param payload  Raw request body as a Buffer (before JSON parsing).
   * @param headers  All request headers, lower-cased.
   * @param secret   Webhook signing secret from config.
   * @returns true if the signature is valid, false otherwise.
   */
  verifyWebhook?(payload: Buffer, headers: Record<string, string>, secret: string): boolean

  /**
   * Parse a verified webhook payload into zero or more events.
   * One platform delivery may contain multiple events.
   *
   * @param payload  Parsed JSON body of the verified webhook request.
   */
  parseWebhookEvents?(payload: Record<string, unknown>): unknown[]

  /**
   * Derive this connection's external account identifier from its stored
   * credentials (e.g. Stripe `extra.stripeUserId`, Xero `tenantId`). Called at
   * connect time to populate the external-account → connection map used for
   * inbound webhook routing. Adapters whose platform has no stable account id
   * leave this undefined.
   */
  externalAccountId?(credentials: Credentials): string | undefined

  /**
   * Programmatically register `callbackUrl` as a webhook endpoint with the
   * platform (called on connect). Return the platform's endpoint id and, when
   * the platform issues a per-endpoint signing secret (Stripe `whsec_…`), that
   * secret — the caller persists it as the connection's `webhookSecret`.
   * Adapters whose platform requires manual dashboard setup leave this
   * undefined (the operator registers the URL by hand).
   */
  registerWebhook?(
    credentials: Credentials,
    callbackUrl: string,
  ): Promise<{ id?: string; secret?: string }>

  /** Remove a previously-registered webhook endpoint (called on disconnect). */
  unregisterWebhook?(credentials: Credentials, id: string): Promise<void>
}
