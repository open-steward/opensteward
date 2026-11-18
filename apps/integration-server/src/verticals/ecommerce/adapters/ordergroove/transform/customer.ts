/**
 * Ordergroove Customer → canonical Customer.
 *
 * Ordergroove's `Customer` is the merchant's shopper as OG's subscription
 * engine knows them, keyed by `merchant_user_id` — the merchant's own
 * customer id, which is what this adapter uses as the canonical `id` (it is
 * also the path segment for `GET /customers/{merchant_user_id}/`).
 *
 * Shapes confirmed verbatim at
 * https://developer.ordergroove.com/reference/customers-list,
 * https://developer.ordergroove.com/reference/customers-retrieve and
 * https://developer.ordergroove.com/reference/customers-create (fetched
 * 2026-09-13).
 *
 * `POST /customers/create/`'s full Body Params table (fetched from the live
 * page, not just its truncated Response Body Definitions summary) marks
 * `merchant`, `merchant_user_id`, `session_id`, `user_token_id`,
 * `first_name`, `last_name`, `email`, `phone_number`, `phone_type`, `live`,
 * `created`, `last_updated`, `last_login` and `locale` all REQUIRED, with no
 * documented default for most of them:
 *
 *  - `session_id`: "obtained from the og_session_id cookie" of a live
 *    storefront session — there is no documented way to derive one
 *    server-side, so this throws rather than invent a value that only
 *    looks plausible.
 *  - `user_token_id`: "User Token ID" with no documented derivation either
 *    — same treatment.
 *  - `first_name` / `last_name` / `phone_number`: map directly to
 *    `Customer.firstName` / `lastName` / `phone`. Required by Ordergroove
 *    but optional on the canonical shape, so this throws when the caller's
 *    data doesn't actually have them rather than sending `''`.
 *  - `phone_type` / `locale`: required, with a documented set of valid
 *    values (`phone_type`: 0 Invalid/1 Landline/2 Mobile/3 VoIP; `locale`:
 *    a locale string or legacy integer id) but no documented DEFAULT among
 *    them and no source on the canonical `Customer` — throws unless
 *    supplied via `data.metadata`.
 *  - `live`: the docs' own minimal example request is
 *    `curl ... --data '{"live":true}'` — `true` is a documented value, not
 *    an invented one, so it's kept as the default.
 *  - `created` / `last_updated`: "Date of [creation / most recent update]".
 *    Defaulting both to the current instant is true — the record IS being
 *    created (and therefore just-updated) right now — unlike `last_login`
 *    below, this asserts no event that didn't happen.
 *  - `last_login`: "Date of most recent customer account login" — required
 *    by the docs, but a customer being created has never logged in.
 *    Defaulting it to "now" would assert a login that never occurred, so
 *    this is only sent when the caller explicitly supplies one via
 *    `data.metadata.last_login`; otherwise it's left out of the body.
 *
 * `extra_data`, `experiences` and `price_code` carry no "required" marker
 * in the Body Params table and are only sent when present in
 * `data.metadata`.
 */
import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawOrdergrooveCustomer {
  merchant?: string
  merchant_user_id: string
  session_id?: string
  user_token_id?: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone_number?: string | null
  phone_type?: number | string
  live?: boolean | string
  created?: string
  last_updated?: string
  last_login?: string | null
  extra_data?: unknown
  locale?: string | number
  price_code?: string
  [key: string]: unknown
}

export function transformCustomer(raw: RawOrdergrooveCustomer): Customer {
  return {
    id: raw.merchant_user_id,
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: raw.phone_number ?? undefined,
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.last_updated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** `YYYY-MM-DD HH:MM:SS` in UTC — the format every Ordergroove example uses. */
function formatOrdergrooveDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export interface BuildCreateCustomerOptions {
  /** Merchant id (required by `POST /customers/create/`) — from the
   *  connection's `credentials.extra.merchantId`, not from customer data. */
  merchantId?: string
}

/**
 * Canonical Customer → `POST /customers/create/` body.
 *
 * Throws, naming the field, for every documented-required field this
 * adapter cannot honestly source — see the file header for the reasoning
 * behind each one. Never invents `first_name`/`last_name`/`phone_number` as
 * `''`, a `session_id`/`user_token_id` that only looks plausible, or a
 * `phone_type`/`locale` guess.
 */
export function buildCreateCustomerBody(
  data: Partial<Customer>,
  options: BuildCreateCustomerOptions = {},
): Record<string, unknown> {
  if (!data.email) {
    throw new Error('Ordergroove createCustomer requires `email`.')
  }
  const meta = (data.metadata ?? {}) as Record<string, unknown>
  const now = formatOrdergrooveDatetime(new Date())
  const merchant = (meta['merchant'] as string | undefined) ?? options.merchantId
  if (!merchant) {
    throw new Error(
      'Ordergroove createCustomer requires a merchant id — supply it via ' +
        "the connection's credentials.extra.merchantId or data.metadata.merchant.",
    )
  }

  const merchantUserId = data.id ?? (meta['merchant_user_id'] as string | undefined)
  if (!merchantUserId) {
    throw new Error('Ordergroove createCustomer requires `id` (merchant_user_id).')
  }

  if (!data.firstName) {
    throw new Error(
      'Ordergroove createCustomer requires `first_name` (documented as required) — supply Customer.firstName.',
    )
  }
  if (!data.lastName) {
    throw new Error(
      'Ordergroove createCustomer requires `last_name` (documented as required) — supply Customer.lastName.',
    )
  }
  if (!data.phone) {
    throw new Error(
      'Ordergroove createCustomer requires `phone_number` (documented as required) — supply Customer.phone.',
    )
  }

  const sessionId = meta['session_id'] as string | undefined
  if (!sessionId) {
    throw new Error(
      'Ordergroove createCustomer requires `session_id`. The docs describe it as ' +
        '"obtained from the og_session_id cookie" of a live storefront session ' +
        '(developer.ordergroove.com/reference/customers-create) with no server-derivable ' +
        'format — supply one via data.metadata.session_id.',
    )
  }
  const userTokenId = meta['user_token_id'] as string | undefined
  if (!userTokenId) {
    throw new Error(
      'Ordergroove createCustomer requires `user_token_id`, with no documented ' +
        'server-derivable value — supply one via data.metadata.user_token_id.',
    )
  }
  const phoneType = meta['phone_type']
  if (phoneType === undefined) {
    throw new Error(
      'Ordergroove createCustomer requires `phone_type` (0 Invalid / 1 Landline / ' +
        '2 Mobile / 3 VoIP — no documented default) — supply it via data.metadata.phone_type.',
    )
  }
  const locale = meta['locale']
  if (locale === undefined) {
    throw new Error(
      'Ordergroove createCustomer requires `locale` (a locale string like "en-US" or a ' +
        'legacy integer id — no documented default) — supply it via data.metadata.locale.',
    )
  }

  const body: Record<string, unknown> = {
    merchant,
    merchant_user_id: merchantUserId,
    session_id: sessionId,
    user_token_id: userTokenId,
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    phone_number: data.phone,
    phone_type: phoneType,
    // The docs' own minimal example request is `--data '{"live":true}'` —
    // a documented value, not an invented one.
    live: meta['live'] ?? true,
    // Both are true statements about a record being created right now —
    // unlike `last_login` below, neither asserts an event that didn't
    // happen.
    created: (meta['created'] as string | undefined) ?? now,
    last_updated: (meta['last_updated'] as string | undefined) ?? now,
    locale,
  }
  // Required by the docs, but a customer being created has never logged
  // in — only send it when the caller actually supplies one.
  if (meta['last_login'] !== undefined) body.last_login = meta['last_login']
  if (meta['extra_data'] !== undefined) body.extra_data = meta['extra_data']
  if (meta['experiences'] !== undefined) body.experiences = meta['experiences']
  if (meta['price_code'] !== undefined) body.price_code = meta['price_code']

  return body
}
