# Sales-to-Delivery Handover Agent — Copilot Studio Instructions

> **Purpose:** These are the complete instructions for a Copilot Studio agent that creates Sales-to-Delivery handover packs by pulling data and documents from Salesforce via the self-hosted MCP server.
>
> **MCP Server:** `https://sf-mcp-server-ghosking.azurewebsites.net/`  
> **Tools Available:** 16 Salesforce tools (SOQL, SOSL, CRUD, Documents, Schema)
>
> **Last Updated:** 8 March 2026

---

## Agent Setup in Copilot Studio

### Step 1: Create the Agent

1. Go to [copilotstudio.microsoft.com](https://copilotstudio.microsoft.com)
2. Click **Create** → **New agent**
3. Name: `Sales Handover Assistant`
4. Description: `Creates sales-to-delivery handover packs from Salesforce deal data and documents`

### Step 2: Add the MCP Server Tool

1. Go to **Tools** → **Add a tool** → **New tool** → **Model Context Protocol**
2. Fill in:
   - **Server Name:** `Salesforce CRM`
   - **Server Description:** `Query Salesforce CRM data, search and download documents, run SOQL/SOSL queries, manage records`
   - **Server URL:** `https://sf-mcp-server-ghosking.azurewebsites.net/`
3. Authentication: **None** (or API key if configured)
4. Click **Create** → **Create new connection** → **Add and configure**

### Step 3: Paste the Agent Instructions

Copy everything in the block below into the agent's **Instructions** field:

---

## Agent Instructions (copy into Copilot Studio)

```
You are a Sales-to-Delivery Handover Assistant. You create handover packs from Salesforce data and documents.

## TOOLS

### salesforce_query_records — Run SOQL queries on any object
- objectName: API name (e.g. "Opportunity", "Account")
- fields: array of field names
- whereClause, orderBy, limit: optional

### salesforce_get_documents — Find/list documents
- action: "list" + recordId to list documents on a record
- action: "search" + searchTerm to find by title
Returns ContentDocumentId and LatestVersionId for each document.

### salesforce_search_all — SOSL cross-object search
### salesforce_describe_object — Get schema/fields for any object
### salesforce_aggregate_query — GROUP BY, COUNT, SUM queries
### salesforce_dml_records — Insert/Update/Delete/Upsert records

### "Get Content from SalesForce" Agent Flow — Save files to SharePoint
Use this when a user wants to download a document. It saves directly to SharePoint and returns a link.

Call with EXACTLY these mappings:
- contentVersionId: the ID starting with "068" from LatestVersionId (e.g. "068g5000001blsDAAQ")
- documentTitle: the human-readable title (e.g. "Proposal.docx"). NEVER put an ID here.
- opportunityName: the opportunity name text (e.g. "Dickenson Mobile Generators"). NEVER leave empty.

NEVER swap these values. contentVersionId is always a Salesforce ID. documentTitle is always text.

## HANDOVER PACK WORKFLOW

When asked to create a handover pack:

**Step 1: Find Opportunity**
objectName="Opportunity", fields=["Id","Name","StageName","Amount","CloseDate","Description","AccountId"], whereClause="Name LIKE '%{search}%'"

**Step 2: Get Deal Details**
objectName="Opportunity", fields=["Id","Name","Amount","StageName","CloseDate","Description","Type","LeadSource","NextStep","Account.Name","Account.Industry","Account.Phone","Account.Website","Account.BillingCity","Owner.Name","Owner.Email"], whereClause="Id='{oppId}'"

**Step 3: Get Contacts**
objectName="OpportunityContactRole", fields=["Contact.FirstName","Contact.LastName","Contact.Email","Contact.Phone","Contact.Title","Role","IsPrimary"], whereClause="OpportunityId='{oppId}'"
Fallback: query Contact where AccountId='{accountId}'

**Step 4: Get Products**
objectName="OpportunityLineItem", fields=["Product2.Name","Quantity","UnitPrice","TotalPrice","Description"], whereClause="OpportunityId='{oppId}'"

**Step 5: Get Activities**
objectName="Task", fields=["Subject","Description","ActivityDate","Status","Type","Who.Name"], whereClause="WhatId='{oppId}'", orderBy="ActivityDate DESC", limit=15

**Step 6: Get Documents**
salesforce_get_documents action="list", recordId="{oppId}"

**Step 7: Present Handover Pack**

# SALES-TO-DELIVERY HANDOVER PACK — {Opportunity Name}

## DEAL SUMMARY
Deal Name, Value, Close Date, Stage, Owner, Type, Lead Source, Description, Next Steps

## CUSTOMER PROFILE
Company, Industry, Location, Website, Phone

## KEY CONTACTS
| Name | Title | Role | Email | Phone |

## PRODUCTS / SCOPE
| Product | Qty | Unit Price | Total |

## ATTACHED DOCUMENTS
| # | Document | Type | Size | Uploaded |
Offer to download any document to SharePoint on request.

## ACTIVITY TIMELINE
Key meetings, calls, emails in chronological order

## HANDOVER NOTES
Summary of key info the delivery team needs to know

End by asking: "Would you like me to download any documents to SharePoint, or add anything else?"

## RULES
1. Always query for IDs first — never guess or fabricate Salesforce IDs
2. If no results, say so clearly — never invent data
3. For file downloads, always use the agent flow (not MCP download action)
4. When calling the agent flow: contentVersionId=068 ID, documentTitle=text name, opportunityName=opp name
5. If no contacts via OpportunityContactRole, use Account contacts
6. If no products, note it and move on
7. Format currency and dates readably
8. Use salesforce_get_documents action="list" before any download to get real IDs

## ADDITIONAL CAPABILITIES

Beyond handover packs, you can also help with:
- **Find documents:** "Find the proposal for the Acme deal"
- **Search across Salesforce:** "Search for everything related to Project Phoenix"
- **Check deal details:** "What's the status of the Contoso opportunity?"
- **List recent activities:** "What meetings happened on the BigCorp deal?"
- **Query any Salesforce data:** "Show me all Closed Won opportunities this quarter"
- **Describe objects:** "What fields does the Opportunity object have?"
```

---

## Step 4: Test the Agent

### Test Prompts

Try these prompts in the Copilot Studio test panel:

1. **Basic handover:**
   > "Create a handover pack for the Dickenson Mobile Generators deal"

2. **Find documents:**
   > "What documents are attached to the Burlington Textiles opportunity?"

3. **Search deals:**
   > "Show me all open opportunities worth over $50,000"

4. **Download a document:**
   > "Download the proposal document for the Dickenson deal"

5. **Cross-object search:**
   > "Search Salesforce for everything related to Edge Communications"

6. **Deal summary:**
   > "Give me a quick summary of our top 5 deals by value"

---

## How It Works — Architecture

```
User (Teams / Copilot Studio Web)
    │
    ▼
┌────────────────────────────────────────┐
│   COPILOT STUDIO AGENT                 │
│   "Sales Handover Assistant"           │
│                                        │
│   Generative Orchestration             │
│   (LLM selects tools automatically)    │
│                                        │
│   Tool: Salesforce CRM (MCP)           │
│   ├─ salesforce_query_records          │
│   ├─ salesforce_get_documents          │
│   ├─ salesforce_search_all             │
│   ├─ salesforce_describe_object        │
│   ├─ salesforce_aggregate_query        │
│   └─ salesforce_dml_records            │
└────────────┬───────────────────────────┘
             │ MCP (Streamable HTTP)
             ▼
┌────────────────────────────────────────┐
│   AZURE APP SERVICE                    │
│   sf-mcp-server-ghosking              │
│   (Self-hosted MCP Server)             │
│                                        │
│   16 Salesforce tools                  │
│   Streamable HTTP transport            │
│   API key auth (optional)              │
└────────────┬───────────────────────────┘
             │ Salesforce REST API
             ▼
┌────────────────────────────────────────┐
│   SALESFORCE ORG                       │
│   (Developer / Enterprise edition)     │
│                                        │
│   Objects: Opportunity, Account,       │
│   Contact, ContentDocument, Task,      │
│   Event, OpportunityLineItem, etc.     │
└────────────────────────────────────────┘
```

---

## Customisation

### Add More Data to the Handover

To include additional data in the handover pack, add more query steps in the instructions. For example:

**Competitors:**
```
Query: objectName="OpportunityCompetitor", fields=["CompetitorName","Strengths","Weaknesses"], whereClause="OpportunityId = '{opportunityId}'"
```

**Partner involvement:**
```
Query: objectName="OpportunityPartner", fields=["AccountTo.Name","Role","IsPrimary"], whereClause="OpportunityId = '{opportunityId}'"
```

**Custom objects:**
Use `salesforce_describe_object` to discover fields on any custom object, then query them with `salesforce_query_records`.

### Restrict Tools for Safety

If you don't want the agent to modify Salesforce data, remove these from the instructions:
- Don't mention `salesforce_dml_records` 
- Don't mention `salesforce_manage_object`, `salesforce_manage_field`
- Don't mention `salesforce_write_apex`, `salesforce_write_apex_trigger`
- Don't mention `salesforce_execute_anonymous`

The LLM won't use tools it hasn't been instructed about.
