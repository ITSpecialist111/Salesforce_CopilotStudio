# Setup Guide — Salesforce MCP Server for Copilot Studio

> Step-by-step guide to deploy and connect the self-hosted Salesforce MCP Server to Microsoft Copilot Studio.

---

## Overview

This guide covers three areas:
1. **Salesforce Setup** — Configure API access and credentials
2. **Azure Deployment** — Deploy the MCP server to Azure App Service
3. **Copilot Studio Setup** — Connect the MCP server to your agent

**Time required:** ~45 minutes  
**Skill level:** Intermediate (familiarity with Salesforce admin, Azure portal, Copilot Studio)

---

## Part 1: Salesforce Setup

### Step 1.1: Verify API Access

Your Salesforce org must have API access enabled.

1. Log in to Salesforce
2. Go to **Setup** → Quick Find → **Company Information**
3. Confirm your edition supports API access (Developer, Enterprise, Unlimited — NOT Essentials/Group)
4. Note your **Org ID** for reference

### Step 1.2: Check User Permissions

Your Salesforce user needs:

1. Go to **Setup** → Quick Find → **Users** → find your user
2. Click your **Profile** → verify these permissions:
   - **API Enabled** ✓
   - **Approve Uninstalled Connected Apps** ✓ (under System Permissions)
3. The user must have access to the objects you want to query (Account, Opportunity, Contact, ContentDocument, etc.)

### Step 1.3: Get Your Security Token

The MCP server uses username/password authentication, which requires a security token.

1. Go to **Setup** → Quick Find → **"Reset My Security Token"**
2. Click **Reset Security Token**
3. Check your email — Salesforce sends the token to your registered email address
4. **Save the token** — you'll need it for Azure configuration

> **Note:** The security token changes every time you reset your password. If you change your password, repeat this step.

### Step 1.4: Enable OAuth Flows (if needed)

1. Go to **Setup** → Quick Find → **"OAuth and OpenID Connect Settings"**
2. Ensure **"Allow OAuth User-Agent Flows"** is toggled **ON**
3. Ensure **"Require Proof Key for Code Exchange (PKCE)"** is toggled **OFF** (unless you're using PKCE-based auth)

### Step 1.5: Note Your Credentials

You'll need these for the Azure deployment:

| Item | Where to find it | Example |
|---|---|---|
| **Username** | Your Salesforce login email | `user@company.com` |
| **Password** | Your Salesforce password | `MyPassword123!` |
| **Security Token** | Emailed after Step 1.3 | `aBcDeFgHiJkLmNoP` |
| **Login URL** | `https://login.salesforce.com` (production) or `https://test.salesforce.com` (sandbox) | `https://login.salesforce.com` |

---

## Part 2: Azure Deployment

### Step 2.1: Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- [Node.js 18+](https://nodejs.org/) installed
- An Azure subscription

### Step 2.2: Clone and Build

```bash
git clone <this-repo-url>
cd mcp-server-salesforce
npm install
npm run build
```

### Step 2.3: Create Azure Resources

```bash
# Login to Azure
az login

# Set your subscription (if you have multiple)
az account set --subscription "YOUR_SUBSCRIPTION_NAME"

# Create a resource group
az group create --name rg-sf-mcp --location westeurope

# Create an App Service plan (B1 = ~$13/month)
az appservice plan create \
  --name plan-sf-mcp \
  --resource-group rg-sf-mcp \
  --sku B1 \
  --is-linux \
  --location westeurope

# Create the web app
az webapp create \
  --name YOUR-APP-NAME \
  --resource-group rg-sf-mcp \
  --plan plan-sf-mcp \
  --runtime "NODE:20-lts"
```

> **Important:** Replace `YOUR-APP-NAME` with a globally unique name. Your MCP server URL will be `https://YOUR-APP-NAME.azurewebsites.net`.

### Step 2.4: Configure Salesforce Credentials

```bash
az webapp config appsettings set \
  --name YOUR-APP-NAME \
  --resource-group rg-sf-mcp \
  --settings \
    SALESFORCE_CONNECTION_TYPE=User_Password \
    SALESFORCE_USERNAME="your-user@salesforce.com" \
    SALESFORCE_PASSWORD="your-password" \
    SALESFORCE_TOKEN="your-security-token" \
    SALESFORCE_INSTANCE_URL="https://login.salesforce.com" \
    PORT=8080 \
    WEBSITES_PORT=8080
```

> **Security:** For production, consider using Azure Key Vault references instead of plain text App Settings. See [Key Vault references](https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references).

### Step 2.5: Set Startup Command

```bash
az webapp config set \
  --name YOUR-APP-NAME \
  --resource-group rg-sf-mcp \
  --startup-file "node dist/http-server.js"
```

### Step 2.6: Deploy the Code

```bash
# Create deployment package
# On Windows:
Compress-Archive -Path dist,node_modules,package.json -DestinationPath deploy.zip

# On Mac/Linux:
zip -r deploy.zip dist node_modules package.json

# Deploy to Azure
az webapp deploy \
  --name YOUR-APP-NAME \
  --resource-group rg-sf-mcp \
  --src-path deploy.zip \
  --type zip
```

### Step 2.7: Verify Deployment

Open in your browser:
```
https://YOUR-APP-NAME.azurewebsites.net/health
```

You should see:
```json
{"status":"ok","server":"salesforce-mcp-server"}
```

### Step 2.8: (Optional) Enable API Key Authentication

To add an API key requirement:

```bash
az webapp config appsettings set \
  --name YOUR-APP-NAME \
  --resource-group rg-sf-mcp \
  --settings API_KEY="your-secure-random-api-key"
```

When configured, all MCP requests must include an `X-API-Key` header with this value. The `/health` endpoint remains public.

---

## Part 3: Copilot Studio Setup

### Option A: MCP Onboarding Wizard (Recommended)

This is the simplest method and is recommended for most users.

#### Step 3A.1: Open the MCP Wizard

1. Go to [copilotstudio.microsoft.com](https://copilotstudio.microsoft.com)
2. Open your agent (or create a new one)
3. Go to **Tools** → **Add a tool** → **New tool**
4. Select **Model Context Protocol**

#### Step 3A.2: Fill in Server Details

| Field | Value |
|---|---|
| **Server Name** | `Salesforce CRM` |
| **Server Description** | `Query and manage Salesforce CRM data — SOQL queries, CRUD operations, document search and download, schema discovery, SOSL search, and more` |
| **Server URL** | `https://YOUR-APP-NAME.azurewebsites.net/` |

#### Step 3A.3: Configure Authentication

**If you set up an API key (Step 2.8):**
- Select **API key** as the authentication type
- Select **Header** as the type
- Enter `X-API-Key` as the header name
- Click **Create**
- When prompted, enter your API key value as the connection credential

**If no API key:**
- Select **None** as the authentication type
- Click **Create**

#### Step 3A.4: Create the Connection

1. After creating the tool, click **Next**
2. Select **Create new connection**
3. If using API key auth, enter the API key value
4. Click **Add and configure**

#### Step 3A.5: Verify Tools

After adding, click on the MCP tool to see the available tools. You should see **16 tools** listed:

- `salesforce_search_objects`
- `salesforce_describe_object`
- `salesforce_query_records`
- `salesforce_aggregate_query`
- `salesforce_dml_records`
- `salesforce_manage_object`
- `salesforce_manage_field`
- `salesforce_manage_field_permissions`
- `salesforce_search_all`
- `salesforce_read_apex`
- `salesforce_write_apex`
- `salesforce_read_apex_trigger`
- `salesforce_write_apex_trigger`
- `salesforce_execute_anonymous`
- `salesforce_manage_debug_logs`
- `salesforce_get_documents`

#### Step 3A.6: Test

1. Click **Test** in Copilot Studio
2. Try a prompt: *"What accounts do we have in Salesforce?"*
3. The agent should use `salesforce_query_records` to query Accounts and return results

---

### Option B: Custom Connector (Advanced)

Use this if you need more control over the connector configuration or if the MCP wizard doesn't work for your setup.

#### Step 3B.1: Create Custom Connector

1. Go to [make.powerapps.com](https://make.powerapps.com)
2. Select your environment
3. Go to **Custom connectors** → **New custom connector** → **Import an OpenAPI file**
4. Import the `swagger.yaml` file from this repo

#### Step 3B.2: Configure Security

On the **Security** tab:
- If using API key: set Authentication type to **API Key**, parameter name `X-API-Key`, location **Header**
- If no auth: leave as **No authentication**

#### Step 3B.3: Update Swagger

On the **Definition** tab, toggle **Swagger editor** and ensure:

```yaml
swagger: '2.0'
info:
  title: Salesforce MCP Server
  description: Self-hosted Salesforce MCP server with 16 tools
  version: 1.0.0
host: YOUR-APP-NAME.azurewebsites.net
basePath: /
schemes:
  - https
paths:
  /:
    post:
      responses:
        '200':
          description: MCP JSON-RPC Response
      x-ms-agentic-protocol: mcp-streamable-1.0
      operationId: InvokeServer
      summary: Salesforce MCP Server
      description: Self-hosted Salesforce MCP server
```

#### Step 3B.4: Create and Test

1. Click **Create connector**
2. Go to **Test** tab → **New connection** → enter API key if required
3. Add the connector to your Copilot Studio agent via **Tools** → **Add a tool** → search for your connector name

---

## Part 4: Agent Instructions (Recommended)

Add these instructions to your Copilot Studio agent to improve query accuracy:

```
When using Salesforce tools:

1. Use salesforce_query_records for all data queries (SOQL)
2. Use salesforce_get_documents to find and download files
3. Use salesforce_search_all for cross-object text search (SOSL)
4. Use salesforce_describe_object to discover available fields before querying

Common query patterns:
- Find opportunities: objectName="Opportunity", fields=["Id","Name","StageName","Amount","CloseDate"]
- Find accounts: objectName="Account", fields=["Id","Name","Industry","Phone"]
- Find contacts for account: objectName="Contact", fields=["Id","FirstName","LastName","Email"], whereClause="AccountId = 'ACCOUNT_ID'"
- Find documents for a record: use salesforce_get_documents with action="list" and recordId

Always limit results with the limit parameter (default 20).
```

---

## Troubleshooting

### MCP server returns no tools in Copilot Studio
- Verify the health endpoint works: `https://YOUR-APP-NAME.azurewebsites.net/health`
- Check Azure App Service logs: `az webapp log tail --name YOUR-APP-NAME --resource-group rg-sf-mcp`
- Ensure `WEBSITES_PORT=8080` and `PORT=8080` are set in App Settings

### Salesforce authentication fails
- Check that `SALESFORCE_USERNAME`, `SALESFORCE_PASSWORD`, and `SALESFORCE_TOKEN` are correct in App Settings
- The security token changes when you reset your password — get a new one
- For sandboxes, set `SALESFORCE_INSTANCE_URL=https://test.salesforce.com`

### API Key rejected
- Ensure the `X-API-Key` header value matches the `API_KEY` app setting exactly
- The header name is case-sensitive

### "Session not found" errors
- MCP sessions are stored in memory — they're lost when the app restarts
- This is expected behaviour; the client will automatically re-initialize

### Tools work in test but fail in production
- Check the user's Salesforce permissions for the objects being queried
- Verify the Salesforce API request limits haven't been exceeded

---

## Security Considerations

| Area | Recommendation |
|---|---|
| **Salesforce credentials** | Use Azure Key Vault references instead of plain App Settings |
| **API access control** | Enable API key authentication at minimum |
| **Network security** | Consider Azure VNET + Private Endpoints for production |
| **HTTPS** | Enforced by default on Azure App Service |
| **Monitoring** | Enable Application Insights for request logging |
| **Tool restriction** | If you don't need Apex/schema tools, remove them from `http-server.ts` |
| **Salesforce auth** | For production, use OAuth 2.0 Client Credentials instead of username/password |
| **Secret rotation** | Rotate the API key and Salesforce credentials regularly |

---

## Cost

| Resource | SKU | Approximate Cost |
|---|---|---|
| App Service Plan | B1 (Linux) | ~$13/month |
| App Service | - | Included in plan |
| **Total** | | **~$13/month** |

> Use the F1 (Free) SKU for development/testing if available in your region.
