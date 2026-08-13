# Kolbo.AI public plugin review readiness

Prepared locally on 2026-08-13. This document is a pre-submission handoff, not evidence of deployment or OpenAI approval.

## Submission package

- Display name: Kolbo.AI
- Category: Design
- Universal MCP URL: `https://api.kolbo.ai/mcp`
- Authentication: OAuth
- Website: `https://app.kolbo.ai/kolbo-mcp`
- Privacy: `https://kolbo.ai/privacy-policy`
- Terms: `https://kolbo.ai/terms-of-service`
- Support: `support@kolbo.ai`
- Plugin source bundle: `plugins/kolbo/`
- Submission import: `chatgpt-app-submission.json`

The plugin bundle contains the remote MCP declaration, public listing metadata, the official square Kolbo logo, and the complete canonical Kolbo skill tree. It does not contain API keys, OAuth client secrets, or a fabricated public-directory URL.

## Automated review gates

`npm run check-submission-contract` verifies:

- every registered tool has exactly `readOnlyHint`, `openWorldHint`, and `destructiveHint`;
- all hint values are booleans;
- the annotation map has no missing or stale tools;
- annotations survive real MCP `tools/list` serialization;
- widget mappings contain no stale tool names;
- widget CSP entries are exact, production-only hosts;
- widget network connections are limited to `https://api.kolbo.ai`.

`npm run generate-chatgpt-submission` regenerates the review import from the source-of-truth annotation map. The import covers every exposed tool and contains exactly five positive and three negative review tests.

## Deliberate outputSchema warning

All 145 tools currently omit `outputSchema`.

This is not a ChatGPT submission blocker, but reviewers and models benefit from truthful output schemas. Kolbo tools currently have a mix of text-only results and widget-specific `structuredContent`. The MCP SDK requires every successful result for a schema-bearing tool to include matching `structuredContent`, so a blanket schema would break existing tools or falsely describe them.

Follow-up should migrate one tool family at a time: preserve `content[].text`, add stable structured data on every successful path, declare a family-specific Zod output schema, and test both widget and text hosts. Do not use an empty passthrough schema merely to remove the warning.

## Source review findings addressed

- Safety hints use an exact centralized contract and conservative overwrite/delete/spend classifications.
- First-party folder sharing remains private (`openWorldHint:false`). Public document/review links and artifact publishing are open-world.
- `share_doc` is open-world and destructive because it can also disable public sharing.
- SYNCI acquisition/import remains private but destructive because it irreversibly spends vendor/credit value.
- The guest-review `password` input explicitly says it sets a new link password and must not contain a Kolbo account credential.
- Staging, development, and wildcard widget CSP entries were removed.
- Stale `shorts_render` and `shorts_analyze` widget mappings were removed.

## Portal and deployment actions still required

These cannot be completed or proven from this local package:

1. Deploy the reviewed MCP package and backend OAuth changes to production.
2. Confirm the production `tools/list` response exposes the reviewed tool count, hints, metadata, and production CSP.
3. Run a complete browser OAuth flow from ChatGPT and verify consent, PKCE, resource binding, scopes, UserInfo, logout/reconnect, and a real tool call.
4. Add the OpenAI-generated domain-verification token to the production environment and verify the raw-text challenge endpoint.
5. Confirm the OpenAI organization has verified business identity and Apps Management permission.
6. Run OpenAI's scan and resolve any portal-only findings.
7. Upload `chatgpt-app-submission.json`, listing assets, and requested reviewer notes.
8. Submit only after explicit owner approval.

## Submission cautions

- Generation, cloning, paid music, chat generation, transcription, import with a displayed price, and AI editing may spend credits. The assistant should disclose cost or obtain agreement where tool descriptions require it.
- Delete, revoke, replacement-update, and permanent-delete tools must not be triggered from vague requests.
- Public listing URLs are intentionally absent until OpenAI supplies the canonical destination.
- Exact production CSP hosts should be rechecked against real production stock and SYNCI responses immediately before submission.
