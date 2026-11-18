/**
 * DigiSigner "Get Signature Request Status" sample response, verbatim from
 * https://www.digisigner.com/esignature-api/esignature-api-documentation/
 * (GET https://api.digisigner.com/v1/signature_requests/{signature_request_id}).
 */
import type { RawDigiSignerSignatureRequest } from '../../../../../../src/verticals/docsign/adapters/digisigner/transform/envelope'

export const DOC_REQ_ID = 'f9bf5865-de7e-4fd5-8be6-aa8d8f46735c'
export const DOC_DOCUMENT_ID = '5be88823-3ff5-4ec4-8175-459dee50f7fb'
export const DOC_SIGNER_EMAIL = 'invited_signer@email.com'
export const DOC_SIGN_URL =
  'https://www.digisigner.com/online/showDocument?documentId=98d2f2cf-58e7-401e-863e-199ea29c226f&invitationId=acfe6dc3-5a07-4edb-b019-ff23e112a020'

export function documentedSignatureRequest(): RawDigiSignerSignatureRequest {
  return {
    signature_request_id: DOC_REQ_ID,
    send_emails: true,
    embedded: false,
    use_text_tags: false,
    hide_text_tags: false,
    is_completed: false,
    documents: [
      {
        signers: [
          {
            email: DOC_SIGNER_EMAIL,
            is_signature_completed: false,
            sign_document_url: DOC_SIGN_URL,
          },
        ],
        document_id: DOC_DOCUMENT_ID,
      },
    ],
  }
}
