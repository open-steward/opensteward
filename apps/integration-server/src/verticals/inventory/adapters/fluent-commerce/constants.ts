/**
 * Fluent Commerce API constants.
 *
 * The API is account-scoped (docs.fluentcommerce.com, "API Authentication"):
 *   production: https://{ACCOUNT}.api.fluentretail.com
 *   sandbox:    https://{ACCOUNT}.sandbox.api.fluentretail.com
 *   GraphQL:    {host}/graphql
 *   Token URL:  {host}/oauth/token  (password grant via FLUENT_INTEGRATION client id)
 *
 * Pagination: cursor-based (first / after / pageInfo.hasNextPage). The next
 * `after` is the last edge's `cursor`: Fluent's PageInfo has only
 * hasPreviousPage and hasNextPage, no endCursor.
 */

export const API_HOST_SUFFIX = '.api.fluentretail.com'
export const DEFAULT_ENV = 'production'
export const DEFAULT_PAGE_SIZE = 500
/**
 * docs.fluentcommerce.com, "GraphQL Operations": "Values of first and last
 * must be within 1 - 5,000. If the value exceeds 5000, it is replaced by 5000."
 */
export const MAX_PAGE_SIZE = 5000
export const OAUTH_CLIENT_ID = 'FLUENT_INTEGRATION'
export const OAUTH_SCOPE = 'retailer'

export type FluentEnv = 'production' | 'sandbox'

export interface FluentAccount {
  accountId: string
  env: FluentEnv
}

const ACCOUNT_ID = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/
const SANDBOX_LABEL = '.sandbox'

/**
 * Resolve the customer's account and environment from what they typed: an
 * account ID (`ACME`) plus an optional environment, or a pasted API host / URL
 * (`https://ACME.sandbox.api.fluentretail.com/graphql`). The account keeps its
 * case for the `fluent.account` header. Anything outside api.fluentretail.com
 * is refused, because the user's password and the bearer token are sent there.
 */
export function normaliseFluentAccount(rawAccount: unknown, rawEnv: unknown): FluentAccount {
  const envInput = (typeof rawEnv === 'string' ? rawEnv : '').trim().toLowerCase()
  if (envInput && envInput !== 'production' && envInput !== 'sandbox') {
    throw new Error('Fluent environment must be production or sandbox.')
  }

  const value = (typeof rawAccount === 'string' ? rawAccount : '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '')
  if (!value) throw new Error('Fluent account ID is required (e.g. ACME).')

  const outside = () =>
    new Error('Fluent account must be an account ID or a *.api.fluentretail.com host.')
  let accountId = value
  let hostEnv: FluentEnv | undefined
  if (value.includes('.')) {
    if (!value.toLowerCase().endsWith(API_HOST_SUFFIX)) throw outside()
    let prefix = value.slice(0, -API_HOST_SUFFIX.length)
    if (prefix.toLowerCase().endsWith(SANDBOX_LABEL)) {
      hostEnv = 'sandbox'
      prefix = prefix.slice(0, -SANDBOX_LABEL.length)
    } else {
      hostEnv = 'production'
    }
    accountId = prefix
  }
  if (!ACCOUNT_ID.test(accountId)) throw outside()
  if (envInput && hostEnv && envInput !== hostEnv) {
    throw new Error('Fluent environment does not match the account host.')
  }
  return { accountId, env: (envInput || hostEnv || DEFAULT_ENV) as FluentEnv }
}

/** The documented API host for an account: `{account}[.sandbox].api.fluentretail.com`. */
export function fluentApiHost(account: FluentAccount): string {
  const env = account.env === 'sandbox' ? SANDBOX_LABEL : ''
  return `${account.accountId.toLowerCase()}${env}${API_HOST_SUFFIX}`
}
