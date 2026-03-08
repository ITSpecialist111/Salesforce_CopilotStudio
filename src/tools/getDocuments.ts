import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const GET_DOCUMENTS: Tool = {
  name: "salesforce_get_documents",
  description: `Find and retrieve documents linked to Salesforce records.

This tool can:
1. List all documents linked to a record (Opportunity, Account, Contact, Case, etc.)
2. Get document metadata (title, file type, size)
3. Download document content as base64-encoded data

The Salesforce document model:
- ContentDocumentLink connects files to records via LinkedEntityId
- ContentDocument holds file metadata (Title, FileType, ContentSize)
- ContentVersion holds the actual file content (VersionData)

Examples:
1. List documents for an Opportunity:
   - action: "list"
   - recordId: "006xx000001abc"
   
2. Get document details:
   - action: "details"  
   - documentId: "069xx000001abc"

3. Download a document:
   - action: "download"
   - contentVersionId: "068xx000001abc"
   
4. Search documents by title:
   - action: "search"
   - searchTerm: "Proposal"
   - recordId: "006xx000001abc" (optional - scope to a specific record)`,
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "details", "download", "search"],
        description:
          "Action to perform: 'list' documents for a record, 'details' of a specific document, 'download' file content, or 'search' documents by title",
      },
      recordId: {
        type: "string",
        description:
          "Salesforce record ID to find linked documents for (used with 'list' and optionally 'search')",
      },
      documentId: {
        type: "string",
        description: "ContentDocument ID (used with 'details')",
      },
      contentVersionId: {
        type: "string",
        description:
          "ContentVersion ID for downloading (used with 'download'). Get this from the LatestPublishedVersionId field.",
      },
      searchTerm: {
        type: "string",
        description:
          "Search term to find documents by title (used with 'search')",
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (default: 20)",
      },
    },
    required: ["action"],
  },
};

export interface GetDocumentsArgs {
  action: "list" | "details" | "download" | "search";
  recordId?: string;
  documentId?: string;
  contentVersionId?: string;
  searchTerm?: string;
  maxResults?: number;
}

export async function handleGetDocuments(
  conn: any,
  args: GetDocumentsArgs
) {
  const limit = args.maxResults || 20;

  try {
    switch (args.action) {
      case "list": {
        if (!args.recordId) {
          throw new Error("recordId is required for 'list' action");
        }

        // Query ContentDocumentLink to find documents linked to the record
        const query = `
          SELECT ContentDocumentId, ContentDocument.Title, ContentDocument.FileType, 
                 ContentDocument.ContentSize, ContentDocument.LatestPublishedVersionId,
                 ContentDocument.CreatedDate, ContentDocument.LastModifiedDate,
                 ContentDocument.CreatedBy.Name, ContentDocument.Description
          FROM ContentDocumentLink 
          WHERE LinkedEntityId = '${args.recordId}'
          ORDER BY ContentDocument.LastModifiedDate DESC
          LIMIT ${limit}
        `;

        const result = await conn.query(query);

        if (!result.records || result.records.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No documents found linked to record ${args.recordId}`,
              },
            ],
            isError: false,
          };
        }

        const docs = result.records.map((r: any, i: number) => {
          const doc = r.ContentDocument;
          const sizeKB = doc.ContentSize
            ? (doc.ContentSize / 1024).toFixed(1)
            : "unknown";
          return `Document ${i + 1}:
    Title: ${doc.Title}
    Type: ${doc.FileType}
    Size: ${sizeKB} KB
    ContentDocumentId: ${r.ContentDocumentId}
    LatestVersionId: ${doc.LatestPublishedVersionId}
    Created: ${doc.CreatedDate} by ${doc.CreatedBy?.Name || "unknown"}
    Description: ${doc.Description || "none"}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${result.totalSize} document(s) linked to record ${args.recordId}:\n\n${docs.join("\n\n")}`,
            },
          ],
          isError: false,
        };
      }

      case "details": {
        if (!args.documentId) {
          throw new Error("documentId is required for 'details' action");
        }

        const query = `
          SELECT Id, Title, FileType, ContentSize, LatestPublishedVersionId, 
                 Description, CreatedDate, LastModifiedDate, CreatedBy.Name,
                 LastModifiedBy.Name, FileExtension, SharingOption, SharingPrivacy
          FROM ContentDocument 
          WHERE Id = '${args.documentId}'
        `;

        const result = await conn.query(query);

        if (!result.records || result.records.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Document not found: ${args.documentId}`,
              },
            ],
            isError: false,
          };
        }

        const doc: any = result.records[0];
        const sizeKB = doc.ContentSize
          ? (doc.ContentSize / 1024).toFixed(1)
          : "unknown";

        // Also get all versions
        const versionsQuery = `
          SELECT Id, VersionNumber, Title, FileType, ContentSize, CreatedDate, 
                 CreatedBy.Name, IsLatest, Description
          FROM ContentVersion 
          WHERE ContentDocumentId = '${args.documentId}'
          ORDER BY VersionNumber DESC
        `;
        const versions = await conn.query(versionsQuery);

        const versionList = versions.records
          .map((v: any) => {
            return `  Version ${v.VersionNumber}: ${v.Title}.${v.FileType} (${((v.ContentSize || 0) / 1024).toFixed(1)} KB) - ${v.IsLatest ? "LATEST" : ""} - ID: ${v.Id}`;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Document Details:
    Title: ${doc.Title}
    Type: ${doc.FileType} (.${doc.FileExtension || doc.FileType})
    Size: ${sizeKB} KB
    Document ID: ${doc.Id}
    Latest Version ID: ${doc.LatestPublishedVersionId}
    Created: ${doc.CreatedDate} by ${doc.CreatedBy?.Name || "unknown"}
    Modified: ${doc.LastModifiedDate} by ${doc.LastModifiedBy?.Name || "unknown"}
    Description: ${doc.Description || "none"}
    Sharing: ${doc.SharingOption} / ${doc.SharingPrivacy}

Versions:
${versionList}

To download, use action "download" with contentVersionId: "${doc.LatestPublishedVersionId}"`,
            },
          ],
          isError: false,
        };
      }

      case "download": {
        if (!args.contentVersionId) {
          throw new Error(
            "contentVersionId is required for 'download' action"
          );
        }

        // Get metadata first
        const metaQuery = `
          SELECT Id, Title, FileType, FileExtension, ContentSize, VersionData
          FROM ContentVersion 
          WHERE Id = '${args.contentVersionId}'
        `;
        const metaResult = await conn.query(metaQuery);

        if (!metaResult.records || metaResult.records.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `ContentVersion not found: ${args.contentVersionId}`,
              },
            ],
            isError: false,
          };
        }

        const version: any = metaResult.records[0];
        const sizeBytes = version.ContentSize || 0;
        const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10MB limit for MCP transport

        if (sizeBytes > MAX_DOWNLOAD_SIZE) {
          return {
            content: [
              {
                type: "text" as const,
                text: `File too large for direct download (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.\n\nFile: ${version.Title}.${version.FileExtension || version.FileType}\nSize: ${(sizeBytes / 1024 / 1024).toFixed(1)} MB\n\nUse the Salesforce REST API directly to download large files:\nGET /services/data/v62.0/sobjects/ContentVersion/${args.contentVersionId}/VersionData`,
              },
            ],
            isError: false,
          };
        }

        // Download the file content via REST API
        const versionDataUrl = `/services/data/v62.0/sobjects/ContentVersion/${args.contentVersionId}/VersionData`;

        try {
          const response = await conn.request({
            method: "GET",
            url: versionDataUrl,
            headers: { Accept: "*/*" },
          } as any);

          // For binary content, encode as base64
          let base64Content: string;
          if (Buffer.isBuffer(response)) {
            base64Content = response.toString("base64");
          } else if (typeof response === "string") {
            base64Content = Buffer.from(response, "binary").toString("base64");
          } else {
            // jsforce may return the content differently
            base64Content = Buffer.from(
              JSON.stringify(response)
            ).toString("base64");
          }

          return {
            content: [
              {
                type: "text" as const,
                text: `Downloaded: ${version.Title}.${version.FileExtension || version.FileType} (${(sizeBytes / 1024).toFixed(1)} KB)\n\nBase64 encoded content (${base64Content.length} characters):\n\n${base64Content}`,
              },
            ],
            isError: false,
          };
        } catch (downloadError: any) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error downloading file: ${downloadError.message}\n\nFile: ${version.Title}.${version.FileExtension || version.FileType}\nContentVersionId: ${args.contentVersionId}\n\nYou can download manually via:\nGET ${conn.instanceUrl}${versionDataUrl}\nAuthorization: Bearer <token>`,
              },
            ],
            isError: true,
          };
        }
      }

      case "search": {
        if (!args.searchTerm) {
          throw new Error("searchTerm is required for 'search' action");
        }

        let query: string;
        if (args.recordId) {
          // Search within documents linked to a specific record
          query = `
            SELECT ContentDocumentId, ContentDocument.Title, ContentDocument.FileType,
                   ContentDocument.ContentSize, ContentDocument.LatestPublishedVersionId,
                   ContentDocument.CreatedDate
            FROM ContentDocumentLink
            WHERE LinkedEntityId = '${args.recordId}'
              AND ContentDocument.Title LIKE '%${args.searchTerm.replace(/'/g, "\\'")}%'
            ORDER BY ContentDocument.LastModifiedDate DESC
            LIMIT ${limit}
          `;
        } else {
          // Search across all documents the user has access to
          query = `
            SELECT Id, Title, FileType, ContentSize, LatestPublishedVersionId, 
                   CreatedDate, CreatedBy.Name
            FROM ContentDocument
            WHERE Title LIKE '%${args.searchTerm.replace(/'/g, "\\'")}%'
            ORDER BY LastModifiedDate DESC
            LIMIT ${limit}
          `;
        }

        const result = await conn.query(query);

        if (!result.records || result.records.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No documents found matching "${args.searchTerm}"${args.recordId ? ` linked to record ${args.recordId}` : ""}`,
              },
            ],
            isError: false,
          };
        }

        const docs = result.records.map((r: any, i: number) => {
          // Handle both ContentDocumentLink and ContentDocument result shapes
          const doc = r.ContentDocument || r;
          const docId = r.ContentDocumentId || r.Id;
          const sizeKB = doc.ContentSize
            ? (doc.ContentSize / 1024).toFixed(1)
            : "unknown";
          return `${i + 1}. ${doc.Title} (.${doc.FileType}) - ${sizeKB} KB
   DocumentId: ${docId}
   VersionId: ${doc.LatestPublishedVersionId}
   Created: ${doc.CreatedDate}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${result.totalSize} document(s) matching "${args.searchTerm}":\n\n${docs.join("\n\n")}`,
            },
          ],
          isError: false,
        };
      }

      default:
        throw new Error(
          `Unknown action: ${args.action}. Use 'list', 'details', 'download', or 'search'.`
        );
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
