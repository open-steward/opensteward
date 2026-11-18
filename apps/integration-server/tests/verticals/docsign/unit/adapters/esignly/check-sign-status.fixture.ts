/**
 * The documented success example of "Get Document status"
 * (POST /v1/checkSignStatus/) in eSignly's API reference,
 * https://www.esignly.com/eSignlyDec16-postmanCollection.json (rendered at
 * https://www.esignly.com/api-docs.html), copied verbatim.
 */
import type { RawEsignlySignature } from '../../../../../../src/verticals/docsign/adapters/esignly/transform/signer'

export const CHECK_SIGN_STATUS_EXAMPLE = {
  has_error: false,
  error_details: '',
  test_mode: 1,
  status: 200,
  signature_request: {
    is_complete: false,
    requester_email_address: 'example@example',
    signature_request_id: '3449c3227474d304508b1d14b3684c54',
    title: 'test',
    message: 'test',
  },
  signatures: [
    {
      signature_id: '142692',
      signer_email_address: 'example@example.com',
      user_key: '707319997',
      signer_name: '',
      status_code: 'SENT',
      date: null,
      system_details: null,
    },
    {
      signature_id: '142693',
      signer_email_address: 'manager.ke@example.com',
      user_key: '145726793',
      signer_name: '',
      status_code: 'SENT',
      date: null,
      system_details: null,
    },
  ] as RawEsignlySignature[],
}
