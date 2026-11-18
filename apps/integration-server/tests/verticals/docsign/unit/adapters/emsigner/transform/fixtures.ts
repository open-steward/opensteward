/**
 * emSigner fixtures, copied from the vendor's own ASP.NET help pages, which
 * publish a JSON sample for every reply:
 *
 *   - https://api.emsigner.com/Help/Api/POST-api-GetAllDocuments
 *   - https://api.emsigner.com/Help/Api/POST-api-GetWorkflowInfo
 *   - https://api.emsigner.com/Help/Api/GET-api-GetDocumentLog_workflowId_documentId_ReferenceNo_SelectedYear
 *   - https://api.emsigner.com/Help/Api/POST-api-AuthorizeApp
 *
 * Keys are verbatim. Values are the samples' own, except where noted: the
 * samples fill every string with "sample string N", so a value the
 * transform must read as a date, an email or an enum is replaced with one
 * in a documented form, and the replacement is named beside it.
 */
import type {
  RawEmSignerDocumentLogView,
  RawEmSignerFilesView,
  RawEmSignerWorkflowInfo,
} from '../../../../../../../src/verticals/docsign/adapters/emsigner/types'

/** One `FilesView` row of the POST /api/GetAllDocuments sample. */
export const FILES_VIEW_EXAMPLE: RawEmSignerFilesView = {
  WorkFlowId: 1,
  CategoryName: 'sample string 2',
  DisplayName: 'sample string 3',
  // Sample: "sample string 4". An ISO date, the form the Postman collection
  // gives every GetAllDocuments date filter ("yyyy-mm-dd format (e.g., \"2020-06-04\")").
  UploadTime: '2020-06-04',
  Name: 'sample string 5',
  // Sample: "sample string 6". Postman: "Status of the workflow (e.g., Pending, Completed)".
  Status: 'Completed',
  DocumentNumber: 'sample string 7',
  OriginatorId: 8,
  Referenceno: 'sample string 9',
  WorkflowType: 10,
  CustomStatus: 'sample string 11',
  totalRecords: 12,
  IsAttachment: true,
  NoOfDocsCount: 14,
  SignedBy: 'sample string 15',
  SignedDate: 'sample string 16',
}

/** The `Response` of the POST /api/GetWorkflowInfo sample. */
export const WORKFLOW_INFO_EXAMPLE: RawEmSignerWorkflowInfo = {
  WorkflowId: 1,
  ReferenceNo: 'sample string 2',
  WorkflowStatus: 'sample string 3',
  NoOfDocuments: 4,
  NoOfAttachment: 5,
  // Sample: "sample string 6". Postman: "Type of workflow (e.g., \"Serial\", \"Parallel\")".
  WorkflowType: 'Serial',
  DocumentOwner: 'sample string 7',
  LastModifiedBy: 'sample string 8',
  DeclinedDate: 'sample string 9',
  Signatories: [
    {
      // Sample: "sample string 1". Postman describes the UserName header it is
      // matched against as "User EmailId".
      EmailID: 'signer.one@example.com',
      Name: 'sample string 2',
      Status: 'sample string 3',
      Remarks: 'sample string 4',
      SignerType: 5,
      // Sample: "sample string 6".
      SignedDate: '2020-06-04',
      ModeOfSignature: 'sample string 7',
      WorkId: 8,
      CurrentSignatoryName: 'sample string 9',
      PercentageNameMatch: 'sample string 10',
    },
    {
      EmailID: 'sample string 1',
      Name: 'sample string 2',
      Status: 'sample string 3',
      Remarks: 'sample string 4',
      SignerType: 5,
      SignedDate: 'sample string 6',
      ModeOfSignature: 'sample string 7',
      WorkId: 8,
      CurrentSignatoryName: 'sample string 9',
      PercentageNameMatch: 'sample string 10',
    },
  ],
  DocumentInfo: [
    {
      TemplateId: 1,
      DocumentName: 'sample string 2',
      DocumentId: 3,
      UploadDateTime: 'sample string 4',
      DocumentSize: 'sample string 5',
      Modifieddate: 'sample string 6',
      LastModifiedBy: 'sample string 7',
      DeclinedDate: 'sample string 8',
    },
    {
      TemplateId: 1,
      DocumentName: 'sample string 2',
      // Sample: 3 for both entries; a workflow's documents have distinct ids.
      DocumentId: 4,
      UploadDateTime: 'sample string 4',
      DocumentSize: 'sample string 5',
      Modifieddate: 'sample string 6',
      LastModifiedBy: 'sample string 7',
      DeclinedDate: 'sample string 8',
    },
  ],
}

/** The `Response` of the GET /api/GetDocumentLog sample (DateTime values verbatim). */
export const DOCUMENT_LOG_EXAMPLE: RawEmSignerDocumentLogView[] = [
  {
    DocumentName: 'sample string 1',
    DocumentLogs: [
      {
        DateTime: '2026-09-24T19:34:06.939213+05:30',
        // Sample: "sample string 2".
        UserEmail: 'signer.one@example.com',
        Action: 'sample string 3',
        IPAddress: 'sample string 4',
        OSandBrowser: 'sample string 5',
      },
      {
        DateTime: '2026-09-24T19:34:06.939213+05:30',
        UserEmail: 'sample string 2',
        Action: 'sample string 3',
        IPAddress: 'sample string 4',
        OSandBrowser: 'sample string 5',
      },
    ],
  },
  {
    DocumentName: 'sample string 1',
    DocumentLogs: [
      {
        DateTime: '2026-09-24T19:34:06.939213+05:30',
        UserEmail: 'sample string 2',
        Action: 'sample string 3',
        IPAddress: 'sample string 4',
        OSandBrowser: 'sample string 5',
      },
      {
        DateTime: '2026-09-24T19:34:06.939213+05:30',
        UserEmail: 'sample string 2',
        Action: 'sample string 3',
        IPAddress: 'sample string 4',
        OSandBrowser: 'sample string 5',
      },
    ],
  },
]

/** Wrap a reply in the documented `ReturnObject` (sample values). */
export function ok<T>(Response: T): {
  IsSuccess: true
  Messages: string[]
  ErrorCode: number
  Response: T
} {
  return {
    IsSuccess: true,
    Messages: ['sample string 1', 'sample string 2'],
    ErrorCode: 2,
    Response,
  }
}
