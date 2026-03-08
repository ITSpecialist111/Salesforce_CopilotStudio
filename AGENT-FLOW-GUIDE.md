# Agent Flow: Download Salesforce Documents to SharePoint

> Step-by-step guide to configure the Power Automate Agent Flow that downloads files from Salesforce and saves them to SharePoint, returning a clickable link to the user.

---

## Flow Overview

```
┌─────────────────────────────────┐
│  When an agent calls the flow   │
│                                 │
│  Inputs:                        │
│  ├─ contentVersionId (String)   │
│  ├─ documentTitle    (String)   │
│  └─ opportunityName  (String)   │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Send an HTTP request           │
│  (Salesforce connector)         │
│                                 │
│  Method: GET                    │
│  URI: /services/data/v62.0/     │
│    sobjects/ContentVersion/     │
│    {contentVersionId}/          │
│    VersionData                  │
│                                 │
│  → Returns binary file content  │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Create file                    │
│  (SharePoint connector)         │
│                                 │
│  Site: /sites/AutonomousSite    │
│  Folder: /Shared Documents/     │
│          {opportunityName}      │
│  File Name: {documentTitle}     │
│  Content: HTTP response body    │
│                                 │
│  → Saves file to SharePoint     │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Respond to the agent           │
│                                 │
│  Outputs:                       │
│  ├─ FilePath (SharePoint URL)   │
│  └─ Success  (confirmation)     │
└─────────────────────────────────┘
```

---

## Step-by-Step Configuration

### Step 1: Create the Flow

1. In Copilot Studio → your agent → **Tools** → **Add a tool** → **New tool** → **Agent Flow**
2. Name the flow: **"Get Content from SalesForce"**

---

### Step 2: Configure the Trigger — "When an agent calls the flow"

Add **3 text inputs**:

| Input Name | Type | Required | Description |
|---|---|---|---|
| `contentVersionId` | String | Yes | Salesforce ContentVersion ID (starts with "068") |
| `documentTitle` | String | Yes | File name with extension (e.g. "Proposal.docx") |
| `opportunityName` | String | Yes | Opportunity name (used as SharePoint folder) |

---

### Step 3: Add "Send an HTTP request" (Salesforce)

1. Add action → search **"Salesforce"** → select **"Send an HTTP request"**
2. Configure:

| Field | Value |
|---|---|
| **Method** | `GET` |
| **URI** | `concat('/services/data/v62.0/sobjects/ContentVersion/', triggerBody()?['text'], '/VersionData')` |

Use the expression editor (fx) for the URI field. This builds the URL dynamically using the `contentVersionId` input.

**Connection:** Use your existing Salesforce OAuth connection.

---

### Step 4: Add "Create file" (SharePoint)

1. Add action → search **"SharePoint"** → select **"Create file"**
2. Configure:

| Field | Value |
|---|---|
| **Site Address** | `https://absx02771022.sharepoint.com/sites/AutonomousSite` |
| **Folder Path** | `concat('/Shared Documents/', triggerBody()?['text_2'])` |
| **File Name** | Select token: **documentTitle** from the trigger (`triggerBody()?['text_1']`) |
| **File Content** | Select token: **Body** from the "Send an HTTP request" step |

Use the expression editor (fx) for the Folder Path field. This creates a subfolder named after the opportunity.

**Connection:** Use your SharePoint connection.

> **Note:** If the folder doesn't exist, SharePoint will create it automatically.

---

### Step 5: Add "Respond to the agent"

1. Add action → search **"Respond"** → select **"Respond to the agent"**
2. Add **2 outputs**:

| Output Name | Type | Value |
|---|---|---|
| `FilePath` | String | `outputs('Create_file')?['body/{Link}']` |
| `Success` | String | `"File saved to SharePoint successfully"` |

Use the expression editor (fx) for the FilePath value. This returns the full SharePoint URL with proper encoding.

> **Alternative:** If `body/{Link}` returns empty, use:
> ```
> replace(concat('https://absx02771022.sharepoint.com/sites/AutonomousSite', outputs('Create_file')?['body/Path']), ' ', '%20')
> ```

---

### Step 6: Save and Test

1. Click **Save**
2. Return to Copilot Studio
3. The flow should appear as a tool in your agent

---

## Input Mapping Reference

When the agent calls this flow, it maps values from the MCP document listing:

```
MCP salesforce_get_documents (action="list") returns:
┌─────────────────────────────────────────────────┐
│ Document 1:                                     │
│   Title: Northfield Hospital Emergency Power    │
│          Proposal                               │
│   Type: WORD_X                                  │
│   Size: 40.8 KB                                 │
│   ContentDocumentId: 069g5000002lvw9AAA         │
│   LatestVersionId: 068g5000001blsDAAQ  ◄── Use  │
└─────────────────────────────────────────────────┘
                    │
                    ▼ Agent maps to flow inputs:
┌─────────────────────────────────────────────────┐
│ contentVersionId: "068g5000001blsDAAQ"           │
│                   (the LatestVersionId)          │
│                                                 │
│ documentTitle: "Northfield Hospital Emergency   │
│                 Power Proposal.docx"             │
│                (title + extension from Type)     │
│                                                 │
│ opportunityName: "Dickenson Mobile Generators"  │
│                  (from the opportunity query)    │
└─────────────────────────────────────────────────┘
```

### File Type to Extension Mapping

The agent appends the correct extension based on the FileType:

| Salesforce FileType | Extension |
|---|---|
| `WORD_X` | `.docx` |
| `PDF` | `.pdf` |
| `POWER_POINT_X` | `.pptx` |
| `EXCEL_X` | `.xlsx` |
| `PNG` | `.png` |
| `JPG` | `.jpg` |
| `CSV` | `.csv` |
| `TEXT` | `.txt` |

---

## Flow JSON Definition Reference

### Trigger Schema
```json
{
  "type": "object",
  "properties": {
    "text": {
      "title": "contentVersionId",
      "type": "string",
      "x-ms-content-hint": "TEXT"
    },
    "text_1": {
      "title": "documentTitle",
      "type": "string",
      "x-ms-content-hint": "TEXT"
    },
    "text_2": {
      "title": "opportunityName",
      "type": "string",
      "x-ms-content-hint": "TEXT"
    }
  },
  "required": ["text", "text_1", "text_2"]
}
```

### HTTP Request Expression (URI)
```
concat('/services/data/v62.0/sobjects/ContentVersion/', triggerBody()?['text'], '/VersionData')
```

### SharePoint Folder Path Expression
```
concat('/Shared Documents/', triggerBody()?['text_2'])
```

### Response FilePath Expression
```
outputs('Create_file')?['body/{Link}']
```

---

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| **"File not found" on SharePoint link** | URL missing site path or has encoding issues | Use `body/{Link}` instead of building URL manually |
| **File saved without extension** | Agent didn't append extension to documentTitle | Check agent instructions include file type mapping |
| **Agent swaps contentVersionId and documentTitle** | LLM confused about which value goes where | Ensure instructions explicitly state "068 ID" for contentVersionId |
| **Flow fails on HTTP request** | Invalid contentVersionId or Salesforce session expired | Verify the ID starts with "068" and Salesforce connection is active |
| **Folder not created** | SharePoint permissions issue | Ensure the flow connection account has write access to the site |

---

## Customisation

### Change the SharePoint site
Replace `https://absx02771022.sharepoint.com/sites/AutonomousSite` in the Create file step with your target site URL.

### Change the folder structure
Modify the Folder Path expression. Examples:
- By opportunity: `/Shared Documents/{opportunityName}` (current)
- By date: `concat('/Shared Documents/', utcNow('yyyy-MM'), '/', triggerBody()?['text_2'])`
- Flat: `/Shared Documents/Salesforce Downloads`

### Add file metadata
After "Create file", add a "Update file properties" SharePoint action to tag the file with metadata like source system, opportunity ID, etc.
