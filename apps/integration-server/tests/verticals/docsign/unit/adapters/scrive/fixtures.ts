/**
 * Fixtures built from the documented examples at https://apidocs.scrive.com/:
 * the "Document" definition's example JSON (fields this adapter reads, values
 * verbatim) and the "History Items" example.
 */
import type { RawScriveDocument } from '../../../../../../src/verticals/docsign/adapters/scrive/transform/envelope'
import type { RawScriveHistory } from '../../../../../../src/verticals/docsign/adapters/scrive/transform/audit-trail-entry'

export function documentExample(): RawScriveDocument {
  return {
    id: '8222115557375075439',
    title: 'Contract for Magnus',
    parties: [
      {
        id: '189255',
        user_id: '1404',
        is_author: true,
        is_signatory: false,
        signatory_role: 'viewer',
        fields: [
          { type: 'name', order: 1, value: 'Gregory' },
          { type: 'name', order: 2, value: 'Davids' },
          { type: 'email', value: 'noreply@scrive.com' },
          { type: 'company', value: 'Scrive' },
        ],
        sign_order: 1,
        sign_time: null,
        seen_time: null,
        read_invitation_time: null,
        rejected_time: null,
        rejection_reason: null,
        authentication_method_to_view: 'standard',
        authentication_method_to_sign: 'standard',
      },
      {
        id: '189256',
        user_id: null,
        is_author: false,
        is_signatory: true,
        signatory_role: 'signing_party',
        fields: [
          { type: 'name', order: 1, value: 'Magnus' },
          { type: 'name', order: 2, value: 'Söderholm' },
          { type: 'email', value: 'noemail@scrive.com' },
          { type: 'mobile', value: '' },
          { type: 'company', value: 'Scrive' },
          { type: 'company_number', value: '' },
        ],
        sign_order: 1,
        sign_time: '2017-01-13T10:38:49.590815Z',
        seen_time: '2017-01-13T10:38:33.1783Z',
        read_invitation_time: null,
        rejected_time: null,
        rejection_reason: null,
        authentication_method_to_view: 'standard',
        authentication_method_to_sign: 'onfido',
      },
    ],
    file: { name: 'contract.pdf', id: '195124' },
    sealed_file: { name: 'contract.pdf', id: '195172' },
    author_attachments: [],
    ctime: '2017-01-13T10:38:17.916324Z',
    mtime: '2017-01-13T10:38:49.590815Z',
    timeout_time: '2017-04-13T22:59:59Z',
    status: 'closed',
    invitation_message: '',
    is_template: false,
  }
}

export function historyExample(): RawScriveHistory {
  return {
    events: [
      {
        status: 'initiated',
        time: '2015-06-06T17:50:15Z',
        party: 'Not named party (1)',
        text: 'The signing process was initiated.',
      },
    ],
  }
}
