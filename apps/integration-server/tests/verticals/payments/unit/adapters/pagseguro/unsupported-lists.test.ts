/**
 * PagBank (PagSeguro) documents no collection endpoint for customers, charges,
 * refunds or payouts on the host a Connect OAuth token reaches,
 * https://api.pagseguro.com ("A URL base utilizada para acessar as APIS
 * disponibilizadas pelo PagBank no ambiente de Produção",
 * https://developer.pagbank.com.br/docs/ambientes-disponiveis.md).
 *
 * - Charges are read by id only: GET /charges/{charge_id} ("Este endpoint
 *   permite que você consulte o status de um pagamento por meio de seu
 *   identificador da cobrança gerado pelo PagBank.",
 *   https://developer.pagbank.com.br/reference/consultar-pagamento.md).
 * - GET /customers and GET /refunds exist only on the Recurring Payments API,
 *   whose reference server is https://sandbox.api.assinaturas.pagseguro.com
 *   (https://developer.pagbank.com.br/reference/listar-assinantes.md), which
 *   needs its own token ("Para utilizar as APIs de Pagamento Recorrente será
 *   necessário o token de acesso disponibilizado pelo PagBank.",
 *   https://developer.pagbank.com.br/docs/autenticacao-pagamentos-recorrentes.md)
 *   and whose production API host is not documented.
 * - Payouts have no /payouts path at all; cash-outs are listed only by the
 *   separate EDI statement API with its own USER + TOKEN credentials
 *   (https://developer.pagbank.com.br/docs/api-do-extrato-edi.md).
 *
 * So these methods refuse with 501 before any request, and getCharge keeps its
 * documented path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }))

vi.mock('axios', () => {
  const create = vi.fn(() => ({ get: getMock, post: postMock, patch: vi.fn(), delete: vi.fn() }))
  return { default: { create, post: postMock }, create }
})

import { PagseguroAdapter } from '../../../../../../src/verticals/payments/adapters/pagseguro'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'

const CREDS: Credentials = { accessToken: 'tok' }
const adapter = new PagseguroAdapter({
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'https://x/cb',
})

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
})

describe('PagseguroAdapter methods with no documented endpoint', () => {
  it.each([
    ['listCustomers', () => adapter.listCustomers(CREDS, withPageSink({ page: 1, limit: 10 }))],
    ['getCustomer', () => adapter.getCustomer(CREDS, 'CUST_1')],
    ['listCharges', () => adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 10 }))],
    ['listRefunds', () => adapter.listRefunds(CREDS, withPageSink({ page: 1, limit: 10 }))],
    ['getRefund', () => adapter.getRefund(CREDS, 'REFU_1')],
    ['listPayouts', () => adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 10 }))],
    ['getPayout', () => adapter.getPayout(CREDS, 'po_1')],
  ])('%s refuses with 501 NOT_SUPPORTED and sends no request', async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })

  it('getCharge still reads the documented GET /charges/{charge_id}', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        id: 'CHAR_1',
        status: 'PAID',
        amount: { value: 1500, currency: 'BRL', summary: { total: 1500, paid: 1500, refunded: 0 } },
        created_at: '2023-02-08T15:15:11.881-03:00',
      },
    })
    const charge = ChargeSchema.parse(await adapter.getCharge(CREDS, 'CHAR_1'))
    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock.mock.calls[0]?.[0]).toBe('/charges/CHAR_1')
    expect(charge).toMatchObject({
      id: 'CHAR_1',
      amount: 1500,
      currency: 'BRL',
      status: 'succeeded',
    })
  })
})
