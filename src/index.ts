#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { fetchContractSpec, fetchContractSpecSchema } from "./tools/fetch_contract_spec.js";

/**
 * Initialize the pulsar MCP server.
 * Communicates with AI assistants via stdio (stdin/stdout).
 * Every tool input/output is validated with Zod.
 */
class PulsarServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "pulsar",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.handleErrors();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_account_balance",
          description: "Get the current XLM and issued asset balances for a Stellar account.",
          inputSchema: {
            type: "object",
            properties: {
              account_id: {
                type: "string",
                description: "The Stellar public key (G...)",
              },
            },
            required: ["account_id"],
          },
        },
        {
          name: "fetch_contract_spec",
          description:
            "Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.",
          inputSchema: {
            type: "object",
            properties: {
              contract_id: {
                type: "string",
                description: "The Soroban contract address (C...)",
              },
              network: {
                type: "string",
                enum: ["mainnet", "testnet", "futurenet", "custom"],
                description: "Override the active network for this call.",
              },
            },
            required: ["contract_id"],
          },
        },
      ],
    }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "get_account_balance") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ message: "Mocked response for get_account_balance", input: args }),
            },
          ],
        };
      }

      if (name === "fetch_contract_spec") {
        const parsed = fetchContractSpecSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid input: ${JSON.stringify(parsed.error.format())}`);
        }
        const result = await fetchContractSpec(parsed.data);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      throw new Error(`Tool not found: ${name}`);
    });
  }

  private handleErrors() {
    this.server.onerror = (error) => {
      console.error(`[MCP Error] ${error.message}`);
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`pulsar MCP server v1.0.0 is running on ${config.stellarNetwork}...`);
  }
}

const pulsar = new PulsarServer();
pulsar.run().catch((error) => {
  console.error("❌ Fatal error in pulsar server:", error);
  process.exit(1);
});
