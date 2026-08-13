# Public Kolbo Plugin for ChatGPT and Codex

## Decision table

| Decision | Choice |
| --- | --- |
| OpenAI submission type | With MCP, including the canonical Kolbo skill |
| Public MCP endpoint | `https://api.kolbo.ai/mcp` as a Universal URL |
| Public product name | Kolbo.AI |
| Category | Design |
| Authentication | OAuth 2.1 with PKCE, MCP resource binding, OpenID and email scopes |
| Distribution | OpenAI universal plugin directory shared by ChatGPT and Codex |
| Public website | Existing `/kolbo-mcp` page, repositioned around public installation |
| Manual fallback | Keep remote MCP URL and `npx -y @kolbo/mcp install` as developer options |
| Deployment boundary | Prepare and verify locally only. No push, deploy, publication, or submission without explicit approval. |

## 0. Corrections from code audit

1. All 145 MCP tools currently omit the three mandatory safety annotations. Attach an exact, parity-checked contract centrally after registration.
2. Missing `outputSchema` is a warning, not a submission blocker. Do not add fake blanket schemas because current text-only results would violate the SDK contract.
3. The production widget CSP must use only evidenced exact production hosts. Remove staging, development, and wildcard fallbacks. Remove stale widget-map tool names.
4. OAuth currently mints a general Kolbo API key. Public-plugin OAuth credentials must be bound to the exact MCP resource and approved scopes.
5. Requested scopes must be a validated subset. Authorization codes must bind client, redirect, PKCE, resource, scopes, and user, and remain atomically single-use without being burned before binding verification.
6. OpenID discovery, UserInfo, and an environment-backed raw-text OpenAI domain challenge route are required. The actual domain token is supplied only by the portal later.
7. The existing public page is Claude-first, contains stale counts and tool names, and sends ChatGPT users to manual connector setup. Public directory installation becomes primary while manual MCP remains available.
8. `share_doc` can unpublish, replacement updates can overwrite stored state, and share revocation is destructive. Use conservative safety hints.

## MCP deliverables

- Central exact tool annotation map for every registered tool, with explicit `readOnlyHint`, `openWorldHint`, and `destructiveHint`.
- Submission-contract test that rejects missing, stale, duplicate, or non-boolean annotations and stale widget mappings.
- Production-only exact widget CSP with evidence-backed hosts.
- OpenAI-ready plugin archive/source tree containing `.codex-plugin/plugin.json`, square logo, canonical `skills/kolbo/` bundle, public listing URLs, and starter prompts.
- `chatgpt-app-submission.json` covering every exposed tool, exactly five positive tests, and exactly three negative tests.
- Reviewer/readiness document listing the outputSchema warning and remaining portal-only actions.
- Existing smoke, parity, widget, model, skill, install, and prepublish gates remain green.

## Backend deliverables

- OAuth and protected-resource metadata advertise the exact MCP resource and supported scopes.
- OIDC discovery and `/oauth/userinfo` return only stable `sub`, email, and authoritative `email_verified` for correctly scoped connector credentials.
- Connector credentials store constrained OAuth scopes and MCP audience, and MCP/OIDC validate them without breaking intentionally supported manual API keys.
- Authorization and token endpoints validate and bind `resource` and a supported scope subset.
- Authorization code consumption remains atomic and validates all bindings safely.
- Environment-backed `/.well-known/openai-apps-challenge` returns the exact configured token as plain text and fails closed when unset.
- Focused tests cover discovery, DCR, resource, scopes, redirect, PKCE, replay, UserInfo, challenge, and legacy MCP authentication behavior.

## Frontend deliverables

- Reposition `/kolbo-mcp` as the official Kolbo app/plugin page for ChatGPT and Codex.
- Make ChatGPT the default install path and Codex second, while preserving Claude, Claude Code, Cursor, and manual MCP instructions.
- Use disabled or waitlist-safe public-directory CTAs until canonical OpenAI listing URLs exist; never fabricate a listing URL.
- Make the demo host-neutral or ChatGPT-first and use real tool names.
- Explain OAuth, Kolbo credit usage, media sync, privacy, terms, and support.
- Remove stale hard-coded tool counts, dead component remnants, and contradictory API-key CTA copy.
- Update English source copy and all translated locale files through the repository translation workflow.
- Update catalog/navigation discovery copy, route inventory, and route-specific metadata where the current frontend architecture supports it. Document any server/Cloudflare indexing action that cannot be completed locally.

## Verification and review

- MCP: all package gates plus a live-protocol tools/list test against the local server.
- Backend: syntax, focused OAuth tests, security review of audience/scope/identity/redirect/PKCE/challenge paths, and performance review of public endpoints.
- Frontend: translation gates, lint, focused tests, production build, and browser verification at desktop, mobile, and Hebrew RTL.
- Cross-stack: test the remote-connector flow against development only when a safe dev endpoint and credentials are available.
- Produce a final link-verified handoff. Do not claim production readiness without deployed endpoint, browser OAuth, domain challenge, OpenAI scan, and portal review evidence.
