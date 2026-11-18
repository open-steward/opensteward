/**
 * Orderchamp Connect Link form — private-app static token only.
 *
 * "The API requires an access token for making authenticated requests. You
 * can obtain an access token either by creating one manually in your
 * supplier backoffice, or by following the OAuth authorization process when
 * creating a public app... Private app: Go to the API page in the
 * Orderchamp back office to retrieve a private token. Enter this token in
 * your header Authorization: Bearer {token}"
 *
 * The public multi-merchant OAuth flow requires Orderchamp partner approval
 * (a `client_id`/`client_secret` issued after manual review) and its
 * token-exchange endpoint is not independently confirmed from public docs —
 * this adapter implements the private-app token mode only, per the task
 * scope.
 *
 * Docs: https://developers.orderchamp.com/authentication
 */
import { customForm } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

export const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'accessToken',
      label: 'Private app access token',
      type: 'password',
      required: true,
      helpText:
        'Orderchamp backoffice → API page → create a private app token. Scopes ' +
        '(products_read/write, orders_read/write, fulfillment_read/write, customers_read/write, ' +
        'account_read/write) are chosen when the token is created.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const accessToken = (fields['accessToken'] ?? '').trim()
    if (!accessToken) throw new Error('Private app access token is required.')
    return { accessToken }
  },
})
