/**
 * A GoSign5 `Dossier`, as `GET /dossiers/{dossierExternalId}` returns it.
 *
 * Source: InfoCert's GoSign5 OpenAPI ("GoSign5 API (Preview)", version
 * 5.0.PREVIEW), rendered at https://devportal.infocert.digital/gosign/documentation/GoSign5
 * and served raw as `specs/GoSign5.yaml` by the portal's files API
 * (https://devportal.infocert.digital:8443/gosign/files).
 *
 * The spec gives no whole-response example, so every value below is the
 * schema's own per-field `example:` where it has one:
 *   DossierExternalId "2wedtgw43aw4et", customId "1532015", code "PDOPQD0SK",
 *   DossierStatus WORKED, loadingMethod "Web", UserExternalId "XYZ4242",
 *   UserDesignation "John Smith", DateTime "2017-07-21T17:32:28Z",
 *   Document.mimeType "application/pdf", originalFilename "Example document.pdf",
 *   title "Example document", numberPages 5, fileStatus ACCEPTED,
 *   TaskExternalId "tid1672671", howMany 1.
 * `subject`, the second task/actor and the second document have no example in
 * the spec; they are test values in the documented shapes.
 */
import type { RawGoSign5Dossier } from '../../../../../../src/verticals/docsign/adapters/infocert/transform/envelope'

export const DOSSIER_EXAMPLE: RawGoSign5Dossier = {
  externalId: '2wedtgw43aw4et',
  customId: '1532015',
  code: 'PDOPQD0SK',
  loadedBy: 'XYZ4242',
  loadedByUser: 'John Smith',
  type: 'STANDARD',
  subject: 'Supply contract 2026',
  starred: false,
  useType: 'CORPORATE',
  status: 'WORKED',
  loadingMethod: 'Web',
  expireAt: '2017-07-21T17:32:28Z',
  dossierIsLocked: false,
  dossierIsTemplate: false,
  documents: [
    {
      mimeType: 'application/pdf',
      originalFilename: 'Example document.pdf',
      title: 'Example document',
      order: 1,
      visibilityLevel: 'ALL',
      externalId: '2wedtgw43aw4et',
      fileStatus: 'ACCEPTED',
      numberPages: 5,
      createdBy: 'John Smith',
      createdAt: '2017-07-21T17:32:28Z',
    },
    {
      mimeType: 'application/pdf',
      originalFilename: 'Annex.pdf',
      title: 'Annex',
      order: 2,
      visibilityLevel: 'ALL',
      externalId: 'doc-annex-2',
      fileStatus: 'ACCEPTED',
      numberPages: 2,
    },
  ],
  messages: { text: 'Please sign.' },
  process: {
    tasks: [
      {
        externalId: 'tid1672671',
        order: 1,
        taskAction: 'WORK',
        type: 'HUMAN',
        actions: [{ documentExternalId: '2wedtgw43aw4et', type: 'SIGN' }],
        howMany: 1,
        actors: [{ userExternalId: 'XYZ4242', name: 'John Smith' }],
        status: 'DONE',
      },
      {
        externalId: 'tid1672672',
        order: 2,
        taskAction: 'WORK',
        type: 'HUMAN',
        actions: [{ documentExternalId: '2wedtgw43aw4et', type: 'APPROVE' }],
        howMany: 1,
        actors: [{ userExternalId: 'ABC1111', name: 'Jane Roe' }],
        status: 'WORKING',
      },
    ],
  },
}
