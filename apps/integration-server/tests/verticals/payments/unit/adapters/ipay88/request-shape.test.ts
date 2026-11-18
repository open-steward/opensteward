/**
 * iPay88 reads refuse before any request (501 NOT_SUPPORTED).
 *
 * iPay88's first-party API surface is SOAP/ASP only. Its WSDLs declare:
 *   https://payment.ipay88.com.my/ePayment/WebService/MHGatewayService/GatewayService.svc?singleWsdl
 *     <wsdl:operation name="EntryPageFunctionality"> and
 *     <wsdl:operation name="EntryPageFunctionalityV2"> — payment initiation only.
 *   https://payment.ipay88.com.my/ePayment/Webservice/TxInquiryCardDetails/TxDetailsInquiry.asmx?WSDL
 *     <wsdl:operation name="TxDetailsInquiryCardInfo"> — one transaction, keyed by
 *     MerchantCode, ReferenceNo and Amount; refunds only nested inside it as
 *     <s:element minOccurs="0" maxOccurs="1" name="Refund" type="tns:ArrayOfRefundTransaction" />.
 *
 * Nothing lists customers, charges or refunds, and nothing reads a charge or a
 * customer by id alone, so each of these must throw without touching the network.
 */
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Ipay88Adapter } from '../../../../../../src/verticals/payments/adapters/ipay88/index'

const creds = { accessToken: 'k' }

afterEach(() => {
  vi.restoreAllMocks()
})

function spyHttp() {
  const get = vi.fn()
  const post = vi.fn()
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { get, post, create }
}

const cases: Array<[string, (a: Ipay88Adapter) => Promise<unknown>, RegExp]> = [
  ['listCustomers', (a) => a.listCustomers(creds, { page: 1, limit: 10 }), /cannot list customers/],
  ['getCustomer', (a) => a.getCustomer(creds, 'c1'), /cannot read a customer/],
  ['listCharges', (a) => a.listCharges(creds, { page: 2, limit: 5 }), /cannot list charges/],
  ['getCharge', (a) => a.getCharge(creds, 'T123'), /cannot read a charge/],
  ['listRefunds', (a) => a.listRefunds(creds, { page: 1, limit: 10 }), /cannot list refunds/],
]

describe('Ipay88Adapter reads', () => {
  it.each(cases)(
    '%s refuses with 501 NOT_SUPPORTED and sends no request',
    async (_name, call, msg) => {
      const { get, post, create } = spyHttp()
      await expect(call(new Ipay88Adapter())).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(msg),
      })
      expect(get).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )
})
