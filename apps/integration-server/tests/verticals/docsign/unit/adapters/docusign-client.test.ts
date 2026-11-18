/**
 * DocuSign client wiring: the REST base URL.
 *
 * /oauth/userinfo returns each account's `base_uri` as a bare host
 * (`https://demo.docusign.net`), and every resource nests under
 * `${base_uri}/restapi/v2.1/accounts/${accountId}`. The fallback for
 * credentials stored without one must have the same shape, or the path
 * comes out as /restapi/restapi/v2.1.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { DocuSignClient } from '../../../../../src/verticals/docsign/adapters/docusign/client'

afterEach(() => vi.restoreAllMocks())

function baseUrlFor(extra: Record<string, unknown>): unknown {
  const create = vi.spyOn(axios, 'create').mockReturnValue({} as never)
  new DocuSignClient({ accessToken: 'ds_test', extra })
  return create.mock.calls[0]?.[0]?.baseURL
}

describe('DocuSignClient base URL', () => {
  it("nests the account's stored base_uri under /restapi/v2.1/accounts/<id>", () => {
    expect(baseUrlFor({ accountId: 'acc_1', baseUri: 'https://na3.docusign.net' })).toBe(
      'https://na3.docusign.net/restapi/v2.1/accounts/acc_1',
    )
  })

  it('falls back to the demo host without doubling /restapi', () => {
    expect(baseUrlFor({ accountId: 'acc_1' })).toBe(
      'https://demo.docusign.net/restapi/v2.1/accounts/acc_1',
    )
  })
})
