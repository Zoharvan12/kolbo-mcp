# Flow tools

The additive Flow MCP surface calls the shared `/api/v1/flows` API. Kobi Act and external MCP clients use identical saved graph operations. This package does not implement graph persistence, permissions, generation controllers, or credit accounting.

## Workflow

1. Resolve the destination with `list_projects`. Every new Flow requires an explicit project.
2. Discover node fields, connection ports and supported execution variants with `get_flow_schema`. Filter `node_type` when appropriate.
3. Find the exact saved Flow with `list_flow_sessions`, then read `get_flow_session`. Keep its ID separate from chat, project and generation IDs.
4. Send the smallest `update_flow_session` batch with the returned revision and a stable idempotency key. Read-only planning uses only discovery, read, validation and estimation tools.
5. Verify the saved receipt and read affected nodes. Editing alone is a complete deliverable; it does not authorize generation.
6. When execution is requested, estimate the saved revision and chosen scope, honor the user's existing authorization, and pass an explicit aggregate `max_credits` to `run_flow_session`.
7. Poll `get_flow_run` until terminal. Recover uncertain submissions by the original key/run ID; never blindly submit again.

## Tool surface

| Operation | Tools |
| --- | --- |
| Discover/read | `get_flow_schema`, `list_flow_sessions`, `get_flow_session` |
| Create/edit | `create_flow_session`, `update_flow_session`, `validate_flow_session` |
| Organize/reverse | `duplicate_flow_session`, `move_flow_session`, `trash_flow_session`, `restore_flow_session`, `undo_flow_edit` |
| Execute/inspect | `estimate_flow_run`, `run_flow_session`, `list_flow_runs`, `get_flow_run`, `cancel_flow_run`, `retry_flow_run` |

## Exact edit example

```json
{
  "flow_session_id": "SAVED_FLOW_ID",
  "expected_revision": "REVISION_FROM_READ",
  "idempotency_key": "replace-assistant-system-prompt-unique-request",
  "operations": [
    {
      "op": "node.update",
      "node_id": "assistant-1",
      "fields": {
        "prompt": "",
        "config": {
          "systemPrompt": "Write exactly three Hebrew scene descriptions.\nKeep the product name unchanged."
        }
      }
    }
  ]
}
```

Fields are flattened within each operation: `prompt` maps to node data, `config.systemPrompt` belongs to that Assistant node, and `position` belongs to the node envelope. Session instructions use `session.update` and guide Kobi. These scopes are distinct.

Omitted fields remain unchanged. Empty strings clear text. Config keys merge; arrays replace. `unset` removes supported optional node fields, not arbitrary paths. Stable IDs cannot be reassigned. Runtime results and credits are server-owned. `output.select` chooses an existing authorized result. Node deletion does not delete library media.

Connection creation uses `source_handle` and `target_handle`. `edge.update.fields` uses the saved graph names `sourceHandle` and `targetHandle`. Initial `flow_data` uses saved graph envelopes (`nodes[].data`, `edges[].sourceHandle`). Read the live schema before constructing a graph.

A revision conflict requires a fresh read and deliberate reconciliation. Never replace the expected revision without inspecting intervening changes. An uncertain response requires replaying the identical body and idempotency key. Same-session operations should be serialized. Undo uses an edit receipt and current revision; it does not reset the full graph over later work or refund consumed credits.

Mutation responses omit full graphs and preserve compact receipts. Reads default to bounded history/projections supplied by the API. Exact prompt text is never truncated by the MCP layer.

## Validation and release

`node --test test/flow-tools.test.js` covers all 27 node defaults, 15 operation variants, exact Hebrew/multiline/empty prompts, invalid identity/runtime fields, all lifecycle routes, run budgets, annotations, and real MCP discovery/calls through the HTTP client. Tests use a local fake API and spend no credits. They do not prove production deployment or backend permission enforcement.

`src/tools/flow-contract.json` snapshots the API's explicit editable field lists; `flow-schema.js` supplies strict types. The API remains authoritative for node-specific restrictions and runtime support. Refresh the snapshot and parity tests when adding fields. Do not claim execution parity based only on node registration or these package tests.

Publish only after compatible Flow API routes exist. Pin the matching package for embedded Act, then verify external and embedded discovery separately. Generated canonical skill mirrors must be updated through their source distribution, not edited here.
