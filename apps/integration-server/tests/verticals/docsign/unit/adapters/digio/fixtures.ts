/**
 * A Digio "Get Document Details" reply, built only from the documented schema.
 *
 * https://documentation.digio.in/swagger/get_getDocumentObject.json
 *   paths: "/v2/client/document/{docId}": {"get": {"summary": "Get Document Details",
 *     "responses": {"200": {... "$ref": "#/components/schemas/ExternalDocDetails"}}}}
 *   ExternalDocDetails: "id" ("Unique ID to identify documents provided by Digio."),
 *     "agreement_type" (enum ["inbound","outbound"]),
 *     "agreement_status" (enum ["draft","requested","completed","expired","failed"]),
 *     "file_name" ("Name of the file as provided by you"),
 *     "created_at" ("'yyyy-mm-dd hh:mm:ss': Timestamp of Document upload in IST"),
 *     "no_of_pages" ("Number of pages in document"),
 *     "signing_parties" ("Array of signing parties", items SigningPartyDetailsV2)
 *   SigningPartyDetailsV2: "name", "status"
 *     (enum ["requested","signed","expired","sequenced","cancelled","removed","failed","skipped"]),
 *     "type" (enum ["self","org","signatory"]), "signature_type", "signature_mode",
 *     "identifier" ("Email or mobile of the signing party"), "reason", "expire_on"
 *
 * The swagger ships no 200 example, so the values are ours; every key and enum is theirs.
 */
export function documentDetails(
  id = 'DID2409241200000000AB',
  parties: Array<Record<string, unknown>> = [
    {
      name: 'Asha Rao',
      status: 'signed',
      type: 'self',
      signature_type: 'aadhaar',
      signature_mode: 'otp',
      identifier: 'asha@example.com',
      reason: 'Loan agreement',
      expire_on: '2026-10-04 12:00:00',
    },
    {
      name: 'Vikram Shah',
      status: 'requested',
      type: 'signatory',
      signature_type: 'electronic',
      signature_mode: 'slate',
      identifier: '9876543210',
      expire_on: '2026-10-04 12:00:00',
    },
  ],
) {
  return {
    id,
    is_agreement: true,
    agreement_type: 'outbound',
    agreement_status: 'requested',
    file_name: 'Loan Agreement.pdf',
    created_at: '2026-09-24 12:00:00',
    self_signed: false,
    no_of_pages: 4,
    signing_parties: parties,
    sign_request_details: {
      name: 'Acme Finance',
      requested_on: '2026-09-24 12:00:00',
      expire_on: '2026-10-04 12:00:00',
      identifier: 'ops@acme.example',
      requester_type: 'org',
    },
    channel: 'api',
    other_doc_details: { web_hook_available: true },
  }
}
