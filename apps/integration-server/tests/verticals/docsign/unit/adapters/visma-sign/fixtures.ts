/**
 * Fixtures built from the documented examples at
 * https://sign.visma.net/api/docs/v1/ — "Get document status" and "Get
 * invitation templates" — with their JSON typos (a trailing comma after
 * `filename`, a missing comma after `passphrase`) corrected.
 */
import type { RawVismaSignDocument } from '../../../../../../src/verticals/docsign/adapters/visma-sign/transform/envelope'
import type { RawVismaSignTemplate } from '../../../../../../src/verticals/docsign/adapters/visma-sign/transform/template'

export function documentStatus(): RawVismaSignDocument {
  return {
    uuid: 'e59c8dc8-8848-4936-ac7c-50d9ed72085a',
    name: 'Test document',
    status: 'pending',
    files: [{ filename: '0959d490-253c-4910-a818-e0f00e4abc97.pdf' }],
    invitations: [
      {
        uuid: '2076243e-351d-4b29-86ad-c2b02d7f867d',
        status: 'new',
        passphrase: '989c687b',
        email: 'kumppanit.sign+invitee@visma.com',
        sms: '+358408269139',
      },
    ],
  }
}

export function invitationTemplate(): RawVismaSignTemplate {
  return {
    uuid: 'ad12596d-f819-4b06-9862-d080ee27aebd',
    created_by: '27dc315c-7e70-43db-be90-fc2b9a94bd72',
    organization_uuid: '035055b8-fb7f-4971-84c6-fca37a2ad2d0',
    role_uuid: 'd9a0a96d-f4c7-4c77-98d8-d71212da31d0',
    name: 'Testi',
    content: {
      document: { category_uuid: '3336abdb-109b-431b-9e2b-deb841581e4d' },
      inviteOptions: {
        separate_documents: false,
        language: 'fi',
        show_identifier_in_signature: false,
        sign_as_organization: false,
        inviteMethod: 'email_sms',
        selfSign: true,
        document_read: true,
        invite_email_as_org: true,
        customized: { signature_type: 'strong' },
        order: { require_before_sending_next_invitations: true },
        messages: {
          send_invitation_email: true,
          send_invitation_sms: true,
          invitation_email_message: '',
          custom_sms: '',
          separate_invite_parts: true,
          attachment_allowed: true,
          all_signed_mail: true,
        },
      },
    },
    edited_by: '27dc315c-7e70-43db-be90-fc2b9a94bd72',
    edited_on: '2020-02-07 19:47:04',
    used_on: null,
    deleted_by: null,
    deleted_on: null,
  }
}
