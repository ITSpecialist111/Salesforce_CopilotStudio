# Salesforce MCP Server for Copilot Studio

> A self-hosted Salesforce MCP (Model Context Protocol) server with Streamable HTTP transport, designed to connect to Microsoft Copilot Studio.

---

### ⚠️ Disclaimer

**This project is provided for testing, development, and educational purposes only.**

- This is **NOT** an official product of Salesforce, Microsoft, or any affiliated company.
- This project is **NOT** endorsed, supported, or maintained by Salesforce or Microsoft.
- The authors accept **NO liability** for any data loss, security incidents, service disruption, or other damages arising from the use of this software.
- **Do NOT use in production** without performing your own security review, penetration testing, and compliance assessment.
- You are solely responsible for securing your Salesforce credentials, Azure resources, and any data processed through this server.
- Salesforce® is a registered trademark of Salesforce, Inc. Microsoft® and Copilot Studio® are registered trademarks of Microsoft Corporation. All trademarks belong to their respective owners.
- Use of this software is subject to the [MIT License](LICENSE) — provided "as is" without warranty of any kind.

---

## Overview

This project wraps the excellent [tsmztech/mcp-server-salesforce](https://github.com/tsmztech/mcp-server-salesforce) (MIT License) with a **Streamable HTTP transport layer**, enabling it to work with **Microsoft Copilot Studio** as a custom MCP connector.

### Why This Exists

| Approach | Works? | Limitations |
|---|---|---|
| **Salesforce Hosted MCP** (`api.salesforce.com`) | No | Returns 401 "Invalid token" — requires undocumented JWT format, beta is unstable |
| **Microsoft's native Salesforce connector** | Yes | Only 7 tools: GetAccounts, GetOpportunities, GetLeads, GetCases, PostCase, PatchCase, ExecuteSOSLQuery |
| **This self-hosted MCP server** | **Yes** | **15 tools** — full SOQL, CRUD on any object, Apex, schema management |

### Architecture

```
Microsoft Copilot Studio
    → Custom MCP Connector (Streamable HTTP)
        → Azure App Service / Container App
            → This MCP Server (HTTP transport)
                → Salesforce REST API (via jsforce)
```

## Tools Available (15)

| Tool | Description |
|---|---|
| `salesforce_search_objects` | Search for Salesforce objects by name pattern |
| `salesforce_describe_object` | Get full schema metadata for any object |
| `salesforce_query_records` | Execute SOQL queries with relationship support |
| `salesforce_aggregate_query` | GROUP BY, COUNT, SUM, AVG queries |
| `salesforce_dml_records` | Insert, Update, Delete, Upsert on any object |
| `salesforce_manage_object` | Create/modify custom objects |
| `salesforce_manage_field` | Create/modify custom fields |
| `salesforce_manage_field_permissions` | Manage field-level security |
| `salesforce_search_all` | SOSL cross-object search |
| `salesforce_read_apex` | Read Apex class source code |
| `salesforce_write_apex` | Create/update Apex classes |
| `salesforce_read_apex_trigger` | Read trigger source code |
| `salesforce_write_apex_trigger` | Create/update triggers |
| `salesforce_execute_anonymous` | Execute anonymous Apex |
| `salesforce_manage_debug_logs` | Enable/disable/retrieve debug logs |

## Prerequisites

- **Node.js** 18+ 
- **Salesforce org** with API access (Developer, Enterprise, Unlimited edition)
- **Azure subscription** (for hosting)
- **Microsoft Copilot Studio** licence

## Quick Start (Local)

### 1. Clone and install

```bash
git clone <this-repo>
cd mcp-server-salesforce
npm install
```

### 2. Configure Salesforce credentials

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
SALESFORCE_CONNECTION_TYPE=User_Password
SALESFORCE_USERNAME=your-username@salesforce.com
SALESFORCE_PASSWORD=your-password
SALESFORCE_TOKEN=your-security-token
SALESFORCE_INSTANCE_URL=https://login.salesforce.com
PORT=3000
```

> **Security Note:** For production, use OAuth 2.0 Client Credentials flow instead of username/password. Set `SALESFORCE_CONNECTION_TYPE=OAuth_2_0_Client_Credentials` and provide `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET`.

### 3. Build and run

```bash
npm run build
node dist/http-server.js
```

### 4. Test

```bash
# Health check
curl http://localhost:3000/health

# Initialize MCP session
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

## Deploy to Azure

### Option A: Azure App Service

```bash
# Login to Azure
az login

# Create resource group
az group create --name rg-sf-mcp --location uksouth

# Create App Service plan
az appservice plan create --name plan-sf-mcp --resource-group rg-sf-mcp --sku B1 --is-linux

# Create web app
az webapp create --name sf-mcp-server --resource-group rg-sf-mcp --plan plan-sf-mcp --runtime "NODE:18-lts"

# Configure environment variables
az webapp config appsettings set --name sf-mcp-server --resource-group rg-sf-mcp --settings \
  SALESFORCE_CONNECTION_TYPE=User_Password \
  SALESFORCE_USERNAME=your-username@salesforce.com \
  SALESFORCE_PASSWORD=your-password \
  SALESFORCE_TOKEN=your-security-token \
  SALESFORCE_INSTANCE_URL=https://login.salesforce.com \
  PORT=8080

# Deploy
az webapp deploy --name sf-mcp-server --resource-group rg-sf-mcp --src-path ./deploy.zip
```

### Option B: Azure Container Apps

See [DEPLOY-AZURE.md](DEPLOY-AZURE.md) for Container Apps deployment with managed identity.

## Connect to Copilot Studio

### Using the MCP Onboarding Wizard (Recommended)

1. In Copilot Studio → Agent → **Tools** → **Add a tool** → **New tool** → **Model Context Protocol**
2. Fill in:
   - **Server Name:** `Salesforce CRM`
   - **Server Description:** `Query and manage Salesforce data — SOQL, CRUD, schema, Apex`
   - **Server URL:** `https://your-app-name.azurewebsites.net/`
3. Authentication: **None** (if using API key) or **OAuth 2.0** (if using Entra ID)
4. Click **Create** → **Create connection** → **Add to agent**

### Using a Custom Connector (Alternative)

1. In Power Apps → Custom Connectors → Import OpenAPI file
2. Use the provided [swagger.yaml](swagger.yaml)
3. Configure security on the Security tab
4. Add the connector to your Copilot Studio agent

## Security Considerations

### Current State

> **Important:** This project is currently suitable for **development, demos, and internal proof-of-concept** use. It requires additional hardening for enterprise production deployments. See the roadmap below.

| Area | Current State | Enterprise Ready? |
|---|---|---|
| **Salesforce auth** | Username + password + security token in App Settings | No — use OAuth Client Credentials or JWT Bearer |
| **MCP endpoint auth** | Optional API key (`X-API-Key` header) | Partial — add Entra ID for enterprise |
| **Data in transit** | HTTPS enforced by Azure App Service | Yes |
| **Secrets management** | Azure App Settings (encrypted at rest) | Partial — move to Key Vault |
| **Network access** | Open to the internet | No — add IP allowlist or VNET |
| **Audit logging** | None | No — add Application Insights |
| **Token rotation** | Manual | No — needs automated refresh |

### Authentication Options

| Method | Use Case | Setup |
|---|---|---|
| **API Key** (header) | Simple deployments, internal use | Set `API_KEY` env var, pass in `X-API-Key` header |
| **Entra ID OAuth** | Production, multi-tenant | Configure App Registration + Easy Auth on App Service |
| **Network restriction** | Defence in depth | Azure VNET + Private Endpoints |

### Production Checklist

- [ ] Use OAuth 2.0 Client Credentials for Salesforce auth (not username/password)
- [ ] Store secrets in Azure Key Vault, not App Settings
- [ ] Enable HTTPS only
- [ ] Add API key or Entra ID authentication
- [ ] Restrict network access (IP allowlist or VNET)
- [ ] Enable Azure Monitor / Application Insights
- [ ] Set up token refresh error alerting
- [ ] Review which MCP tools to expose (disable Apex/schema tools if not needed)

## Roadmap

### Security Hardening (Priority)

| Item | Status | Description |
|---|---|---|
| **Enable API key authentication** | Ready | Set `API_KEY` env var — already built into the server |
| **Switch to OAuth 2.0 Client Credentials** | Planned | Replace username/password with Connected App client credentials. The server already supports this via `SALESFORCE_CONNECTION_TYPE=OAuth_2_0_Client_Credentials` |
| **Switch to JWT Bearer auth** | Planned | Certificate-based auth — no secrets stored, most secure option |
| **Azure Key Vault integration** | Planned | Move all Salesforce credentials from App Settings to Key Vault references |
| **Entra ID authentication on endpoint** | Planned | Add Azure App Service Easy Auth so only your tenant can access the MCP server |
| **Application Insights logging** | Planned | Log all MCP tool calls, Salesforce queries, and errors for audit trail |
| **VNET + Private Endpoints** | Planned | Restrict network access so only Power Platform can reach the MCP server |
| **Tool-level access control** | Planned | Configure which MCP tools are exposed (e.g. disable write/Apex tools for read-only agents) |
| **Automated secret rotation** | Planned | Alert and rotate Salesforce tokens automatically |

### Features

| Item | Status | Description |
|---|---|---|
| **Streamable HTTP transport** | Done | Enables Copilot Studio MCP integration |
| **Document search, list, download** | Done | Custom `salesforce_get_documents` tool with 4 actions |
| **Accept header fix** | Done | Power Platform API Hub compatibility |
| **API key authentication** | Done | Optional `X-API-Key` header validation |
| **SharePoint Agent Flow integration** | Done | Download Salesforce files → SharePoint with clickable link |
| **Text extraction from documents** | Planned | Extract readable text from Word/PDF for LLM reasoning |
| **Persistent sessions** | Planned | Replace in-memory session store with Redis for multi-instance scaling |
| **Containerised deployment** | Planned | Docker + Azure Container Apps support |

## Project Structure

```
├── src/
│   ├── index.ts              # Original STDIO MCP server (from tsmztech)
│   ├── http-server.ts        # Streamable HTTP wrapper (added for Copilot Studio)
│   ├── tools/                # Tool implementations
│   │   ├── query.ts          # SOQL queries
│   │   ├── dml.ts            # Insert/Update/Delete/Upsert
│   │   ├── search.ts         # Object search
│   │   ├── searchAll.ts      # SOSL search
│   │   ├── describe.ts       # Schema metadata
│   │   ├── aggregateQuery.ts # Aggregate queries
│   │   ├── manageObject.ts   # Custom object management
│   │   ├── manageField.ts    # Custom field management
│   │   ├── readApex.ts       # Read Apex source
│   │   ├── writeApex.ts      # Write Apex source
│   │   └── ...
│   ├── types/                # TypeScript type definitions
│   └── utils/
│       └── connection.ts     # Salesforce connection factory
├── .env.example              # Example environment config
├── package.json
├── tsconfig.json
└── swagger.yaml              # OpenAPI spec for custom connector
```

## Credits

This project is built on top of [tsmztech/mcp-server-salesforce](https://github.com/tsmztech/mcp-server-salesforce) (MIT License). The HTTP transport wrapper (`http-server.ts`) and Copilot Studio integration were added by this project.

## License

MIT — see [LICENSE](LICENSE)
