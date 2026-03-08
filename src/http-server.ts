#!/usr/bin/env node
/**
 * Streamable HTTP wrapper for the tsmztech Salesforce MCP server.
 * Exposes the STDIO-based MCP server over HTTP for Copilot Studio integration.
 * 
 * Usage: node http-server.js [--port 3000]
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";
import http from "http";
import crypto from "crypto";

import { createSalesforceConnection } from "./utils/connection.js";
import { SEARCH_OBJECTS, handleSearchObjects } from "./tools/search.js";
import { DESCRIBE_OBJECT, handleDescribeObject } from "./tools/describe.js";
import { QUERY_RECORDS, handleQueryRecords, QueryArgs } from "./tools/query.js";
import { AGGREGATE_QUERY, handleAggregateQuery, AggregateQueryArgs } from "./tools/aggregateQuery.js";
import { DML_RECORDS, handleDMLRecords, DMLArgs } from "./tools/dml.js";
import { MANAGE_OBJECT, handleManageObject, ManageObjectArgs } from "./tools/manageObject.js";
import { MANAGE_FIELD, handleManageField, ManageFieldArgs } from "./tools/manageField.js";
import { MANAGE_FIELD_PERMISSIONS, handleManageFieldPermissions, ManageFieldPermissionsArgs } from "./tools/manageFieldPermissions.js";
import { SEARCH_ALL, handleSearchAll, SearchAllArgs, WithClause } from "./tools/searchAll.js";
import { READ_APEX, handleReadApex, ReadApexArgs } from "./tools/readApex.js";
import { WRITE_APEX, handleWriteApex, WriteApexArgs } from "./tools/writeApex.js";
import { READ_APEX_TRIGGER, handleReadApexTrigger, ReadApexTriggerArgs } from "./tools/readApexTrigger.js";
import { WRITE_APEX_TRIGGER, handleWriteApexTrigger, WriteApexTriggerArgs } from "./tools/writeApexTrigger.js";
import { EXECUTE_ANONYMOUS, handleExecuteAnonymous, ExecuteAnonymousArgs } from "./tools/executeAnonymous.js";
import { MANAGE_DEBUG_LOGS, handleManageDebugLogs, ManageDebugLogsArgs } from "./tools/manageDebugLogs.js";
import { GET_DOCUMENTS, handleGetDocuments, GetDocumentsArgs } from "./tools/getDocuments.js";

dotenv.config();

const PORT = parseInt(process.env.PORT || "3000", 10);

// Store transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(): Server {
  const server = new Server(
    { name: "salesforce-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      SEARCH_OBJECTS, DESCRIBE_OBJECT, QUERY_RECORDS, AGGREGATE_QUERY,
      DML_RECORDS, MANAGE_OBJECT, MANAGE_FIELD, MANAGE_FIELD_PERMISSIONS,
      SEARCH_ALL, READ_APEX, WRITE_APEX, READ_APEX_TRIGGER, WRITE_APEX_TRIGGER,
      EXECUTE_ANONYMOUS, MANAGE_DEBUG_LOGS, GET_DOCUMENTS
    ],
  }));

  // Copy the exact same tool handler from index.ts
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;
      if (!args) throw new Error("Arguments are required");
      const conn = await createSalesforceConnection();

      switch (name) {
        case "salesforce_search_objects": {
          const { searchPattern } = args as { searchPattern: string };
          if (!searchPattern) throw new Error("searchPattern is required");
          return await handleSearchObjects(conn, searchPattern);
        }
        case "salesforce_describe_object": {
          const { objectName } = args as { objectName: string };
          if (!objectName) throw new Error("objectName is required");
          return await handleDescribeObject(conn, objectName);
        }
        case "salesforce_query_records": {
          const queryArgs = args as Record<string, unknown>;
          if (!queryArgs.objectName || !Array.isArray(queryArgs.fields))
            throw new Error("objectName and fields array are required");
          const validatedArgs: QueryArgs = {
            objectName: queryArgs.objectName as string,
            fields: queryArgs.fields as string[],
            whereClause: queryArgs.whereClause as string | undefined,
            orderBy: queryArgs.orderBy as string | undefined,
            limit: queryArgs.limit as number | undefined,
          };
          return await handleQueryRecords(conn, validatedArgs);
        }
        case "salesforce_aggregate_query": {
          const aggArgs = args as Record<string, unknown>;
          if (!aggArgs.objectName || !Array.isArray(aggArgs.selectFields) || !Array.isArray(aggArgs.groupByFields))
            throw new Error("objectName, selectFields, groupByFields required");
          const validatedArgs: AggregateQueryArgs = {
            objectName: aggArgs.objectName as string,
            selectFields: aggArgs.selectFields as string[],
            groupByFields: aggArgs.groupByFields as string[],
            whereClause: aggArgs.whereClause as string | undefined,
            havingClause: aggArgs.havingClause as string | undefined,
            orderBy: aggArgs.orderBy as string | undefined,
            limit: aggArgs.limit as number | undefined,
          };
          return await handleAggregateQuery(conn, validatedArgs);
        }
        case "salesforce_dml_records": {
          const dmlArgs = args as Record<string, unknown>;
          if (!dmlArgs.operation || !dmlArgs.objectName)
            throw new Error("operation and objectName required");
          const validatedArgs: DMLArgs = {
            operation: dmlArgs.operation as "insert" | "update" | "delete" | "upsert",
            objectName: dmlArgs.objectName as string,
            records: dmlArgs.records as Record<string, unknown>[],
            externalIdField: dmlArgs.externalIdField as string | undefined,
          };
          return await handleDMLRecords(conn, validatedArgs);
        }
        case "salesforce_manage_object": {
          const objArgs = args as Record<string, unknown>;
          if (!objArgs.operation || !objArgs.objectName)
            throw new Error("operation and objectName required");
          return await handleManageObject(conn, objArgs as unknown as ManageObjectArgs);
        }
        case "salesforce_manage_field": {
          const fieldArgs = args as Record<string, unknown>;
          if (!fieldArgs.operation || !fieldArgs.objectName || !fieldArgs.fieldName)
            throw new Error("operation, objectName, fieldName required");
          return await handleManageField(conn, fieldArgs as unknown as ManageFieldArgs);
        }
        case "salesforce_manage_field_permissions": {
          const permArgs = args as Record<string, unknown>;
          if (!permArgs.operation)
            throw new Error("operation is required");
          return await handleManageFieldPermissions(conn, permArgs as unknown as ManageFieldPermissionsArgs);
        }
        case "salesforce_search_all": {
          const searchArgs = args as Record<string, unknown>;
          if (!searchArgs.searchTerm)
            throw new Error("searchTerm is required");
          const validatedArgs: SearchAllArgs = {
            searchTerm: searchArgs.searchTerm as string,
            objects: (searchArgs.objects || []) as Array<{ name: string; fields: string[]; limit?: number; where?: string; orderBy?: string }>,
            searchIn: searchArgs.searchIn as "ALL FIELDS" | "NAME FIELDS" | "EMAIL FIELDS" | "PHONE FIELDS" | "SIDEBAR FIELDS" | undefined,
            withClauses: searchArgs.withClauses as WithClause[] | undefined,

          };
          return await handleSearchAll(conn, validatedArgs);
        }
        case "salesforce_read_apex": {
          const readArgs = args as Record<string, unknown>;
          if (!readArgs.className) throw new Error("className is required");
          return await handleReadApex(conn, readArgs as ReadApexArgs);
        }
        case "salesforce_write_apex": {
          const writeArgs = args as Record<string, unknown>;
          if (!writeArgs.className || !writeArgs.body)
            throw new Error("className and body required");
          return await handleWriteApex(conn, writeArgs as unknown as WriteApexArgs);
        }
        case "salesforce_read_apex_trigger": {
          const trigArgs = args as Record<string, unknown>;
          if (!trigArgs.triggerName) throw new Error("triggerName is required");
          return await handleReadApexTrigger(conn, trigArgs as ReadApexTriggerArgs);
        }
        case "salesforce_write_apex_trigger": {
          const trigArgs = args as Record<string, unknown>;
          if (!trigArgs.triggerName || !trigArgs.body || !trigArgs.objectName)
            throw new Error("triggerName, body, objectName required");
          return await handleWriteApexTrigger(conn, trigArgs as unknown as WriteApexTriggerArgs);
        }
        case "salesforce_execute_anonymous": {
          const execArgs = args as Record<string, unknown>;
          if (!execArgs.code) throw new Error("code is required");
          return await handleExecuteAnonymous(conn, execArgs as unknown as ExecuteAnonymousArgs);
        }
        case "salesforce_manage_debug_logs": {
          const logArgs = args as Record<string, unknown>;
          if (!logArgs.action) throw new Error("action is required");
          return await handleManageDebugLogs(conn, logArgs as unknown as ManageDebugLogsArgs);
        }
        case "salesforce_get_documents": {
          const docArgs = args as Record<string, unknown>;
          if (!docArgs.action) throw new Error("action is required");
          return await handleGetDocuments(conn, docArgs as unknown as GetDocumentsArgs);
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  return server;
}

// HTTP server handling MCP Streamable HTTP transport
const httpServer = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Authorization");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Key authentication (if configured)
  const apiKey = process.env.API_KEY;
  if (apiKey) {
    const providedKey = req.headers["x-api-key"] as string | undefined;
    if (req.url !== "/health" && providedKey !== apiKey) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized: Invalid or missing API key" }));
      return;
    }
  }

  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", server: "salesforce-mcp-server" }));
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "POST") {
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      // Create new session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport!);
          console.error(`[MCP] New session: ${sid}`);
        },
      });

      const server = createMcpServer();
      await server.connect(transport);

      transport.onclose = () => {
        const sid = [...transports.entries()].find(([, t]) => t === transport)?.[0];
        if (sid) {
          transports.delete(sid);
          console.error(`[MCP] Session closed: ${sid}`);
        }
      };
    }

    await transport.handleRequest(req, res);
    return;
  }

  if (req.method === "GET") {
    // SSE endpoint for session
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing or invalid session ID" }));
    return;
  }

  if (req.method === "DELETE") {
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      transports.delete(sessionId);
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing or invalid session ID" }));
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

httpServer.listen(PORT, () => {
  console.error(`Salesforce MCP HTTP Server running on port ${PORT}`);
  console.error(`Health check: http://localhost:${PORT}/health`);
});
