import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Octokit } from "octokit";
import { z } from "zod";
import { Auth0Handler } from "./auth0-handler";

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
type Props = {
  login: string;
  name: string;
  email: string;
  accessToken: string;
};

const ALLOWED_EMAILS = new Set<string>([
  // Add email addresses of users who should have access to the image generation tool
  // For example: 'youremail@example.com', 'coworkeremail@example.com'
  "tetsu.varmos@gmail.com"
]);

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: "Auth0 OAuth Proxy Demo",
    version: "1.0.0",
  });

  async init() {
    // Hello, world!
    this.server.tool("add", "Add two numbers the way only MCP can", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
      content: [{ text: String(a + b), type: "text" }],
    }));

    // Use the upstream access token to facilitate tools
    this.server.tool(
      "multiply",
      "Multiply two numbers, but only if you are authenticated",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => {
        return {
          content: [{ text: String(a * b), type: "text" }],
        };
      },
    );

    // Dynamically add tools based on the user's login. In this case, I want to limit
    // access to my Image Generation tool to just me
	console.log("User props", this.props);
    if (ALLOWED_EMAILS.has(this.props?.email || "definitely not found")) {
      this.server.tool(
        "secretGenerateImage",
        "Generate an image using the `flux-1-schnell` model. Works best with 8 steps.",
        {
          prompt: z.string().describe("A text description of the image you want to generate."),
          steps: z
            .number()
            .min(4)
            .max(8)
            .default(4)
            .describe(
              "The number of diffusion steps; higher values can improve quality but take longer. Must be between 4 and 8, inclusive.",
            ),
        },
        async ({ prompt, steps }) => {
          const response = await this.env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
            prompt,
            steps,
          });

          return {
            content: [{ data: response.image!, mimeType: "image/jpeg", type: "image" }],
          };
        },
      );
    }
  }
}

export default new OAuthProvider({
  // NOTE - during the summer 2025, the SSE protocol was deprecated and replaced by the Streamable-HTTP protocol
  // https://developers.cloudflare.com/agents/model-context-protocol/transport/#mcp-server-with-authentication
  apiHandlers: {
    "/sse": MyMCP.serveSSE("/sse"), // deprecated SSE protocol - use /mcp instead
    "/mcp": MyMCP.serve("/mcp"), // Streamable-HTTP protocol
  },
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: Auth0Handler as any,
  tokenEndpoint: "/token",
});
