import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type Props } from "./utils";
import {
	clientIdAlreadyApproved,
	parseRedirectApproval,
	renderApprovalDialog,
} from "./workers-oauth-utils";
import * as jose from "jose";

const JWKS = jose.createRemoteJWKSet(new URL(`${env.AUTH0_ISSUER}/.well-known/jwks.json`));

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	if (
		await clientIdAlreadyApproved(c.req.raw, oauthReqInfo.clientId, env.COOKIE_ENCRYPTION_KEY)
	) {
		return redirectToAuth0(c.req.raw, oauthReqInfo);
	}

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		server: {
			description: "This is a demo MCP Remote Server using Auth0 for authentication.",
			logo: "https://avatars.githubusercontent.com/u/314135?s=200&v=4",
			name: "Cloudflare Auth0 MCP Server", // optional
		},
		state: { oauthReqInfo }, // arbitrary data that flows through the form submission below
	});
});

app.post("/authorize", async (c) => {
	// Validates form submission, extracts state, and generates Set-Cookie headers to skip approval dialog next time
	const { state, headers } = await parseRedirectApproval(c.req.raw, env.COOKIE_ENCRYPTION_KEY);
	if (!state.oauthReqInfo) {
		return c.text("Invalid request", 400);
	}

	return redirectToAuth0(c.req.raw, state.oauthReqInfo, headers);
});

async function redirectToAuth0(
	request: Request,
	oauthReqInfo: AuthRequest,
	headers: Record<string, string> = {},
) {
	return new Response(null, {
		headers: {
			...headers,
			location: getUpstreamAuthorizeUrl({
				client_id: env.AUTH0_CLIENT_ID,
				redirect_uri: new URL("/callback", request.url).href,
				scope: "profile email openid",
				state: btoa(JSON.stringify(oauthReqInfo)),
				upstream_url: `${env.AUTH0_ISSUER}/authorize`,
				audience: env.AUTH0_AUDIENCE,
			}),
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Auth0 after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
	// Get the oathReqInfo out of KV
	const oauthReqInfo = JSON.parse(atob(c.req.query("state") as string)) as AuthRequest;
	if (!oauthReqInfo.clientId) {
		return c.text("Invalid state", 400);
	}

	// Exchange the code for an access token
	const [accessToken, errResponse] = await fetchUpstreamAuthToken({
		client_id: c.env.AUTH0_CLIENT_ID,
		client_secret: c.env.AUTH0_CLIENT_SECRET,
		code: c.req.query("code"),
		redirect_uri: new URL("/callback", c.req.url).href,
		upstream_url: `${c.env.AUTH0_ISSUER}/oauth/token`,
		grant_type: "authorization_code",
	});
	if (errResponse) return errResponse;


	if (!accessToken) {
		return c.text("Failed to get access token", 500);
	}
	console.log("Got access token", { accessToken });
	// decode by jwt
	const decoded = await jose.jwtVerify(accessToken, JWKS);
	const user = decoded.payload as { sub: string; name: string; email: string; };

	const { name, email } = user;

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: name,
		},
		// This will be available on this.props inside MyMCP
		props: {
			accessToken,
			email,
			name,
		} as Props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: email,
	});

	return Response.redirect(redirectTo);
});

export { app as Auth0Handler };
