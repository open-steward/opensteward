/**
 * emSigner reply shapes, transcribed from the vendor's Swagger document
 * https://api.emsigner.com/swagger/docs/v1 (`definitions`). Every property
 * is optional because the Swagger marks none of them required.
 */

/** `eMDMS.Helper.ReturnObject[…]`: the envelope every emSigner reply is wrapped in. */
export interface EmSignerReturnObject<T> {
  IsSuccess?: boolean
  Messages?: string[]
  ErrorCode?: number
  Response?: T
}

/** `Emsigner.BusinessObject.FilesView`: one row of POST /api/GetAllDocuments. */
export interface RawEmSignerFilesView {
  WorkFlowId?: number
  CategoryName?: string
  DisplayName?: string
  UploadTime?: string
  Name?: string
  Status?: string
  DocumentNumber?: string
  OriginatorId?: number
  Referenceno?: string
  WorkflowType?: number
  CustomStatus?: string
  totalRecords?: number
  IsAttachment?: boolean
  NoOfDocsCount?: number
  SignedBy?: string
  SignedDate?: string
}

/** `EmsignerAPI.BusinessObject.Signatories`. */
export interface RawEmSignerSignatory {
  EmailID?: string
  Name?: string
  Status?: string
  Remarks?: string
  SignerType?: number
  SignedDate?: string
  ModeOfSignature?: string
  WorkId?: number
  CurrentSignatoryName?: string
  PercentageNameMatch?: string
}

/** `BusinessObject.BusinessObject.DocumentInfo`. */
export interface RawEmSignerDocumentInfo {
  TemplateId?: number
  DocumentName?: string
  DocumentId?: number
  UploadDateTime?: string
  DocumentSize?: string
  Modifieddate?: string
  LastModifiedBy?: string
  DeclinedDate?: string
}

/** `BusinessObject.BusinessObject.WorkflowInfo`: the reply of POST /api/GetWorkflowInfo. */
export interface RawEmSignerWorkflowInfo {
  WorkflowId?: number
  ReferenceNo?: string
  WorkflowStatus?: string
  NoOfDocuments?: number
  NoOfAttachment?: number
  WorkflowType?: string
  DocumentOwner?: string
  LastModifiedBy?: string
  DeclinedDate?: string
  Signatories?: RawEmSignerSignatory[]
  DocumentInfo?: RawEmSignerDocumentInfo[]
}

/** `EmsignerAPI.BusinessObject.DocumentLog`. */
export interface RawEmSignerDocumentLog {
  DateTime?: string
  UserEmail?: string
  Action?: string
  IPAddress?: string
  OSandBrowser?: string
}

/** `EmsignerAPI.BusinessObject.DocumentLogView`: one row of GET /api/GetDocumentLog. */
export interface RawEmSignerDocumentLogView {
  DocumentName?: string
  DocumentLogs?: RawEmSignerDocumentLog[]
}
