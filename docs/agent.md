# Agent

The Agent panel helps turn a natural-language request into a reviewed Logicflow project change. It creates proposals; it never changes project state without an explicit user action.

## Enable and Use the Agent Panel

Set the feature flag in `.env.local` and restart the app:

```bash
VITE_APP_ENABLE_AGENT_PANEL=true
```

Open the **Agent** tab, choose a model, add the API key for that provider, and send a request. Drafts, messages, and multiple chat threads are scoped to the current project. Active runs can be cancelled; a new request can be submitted after cancellation.

Keys stay in this browser tab and are not saved. The selected provider may receive the user prompt, relevant project context, and sanitized execution feedback.

## Capabilities and Limitations

The agent can:

- Create, replace, rename, and delete operation files.
- Update supported cross-file operation references.
- Propose changes to supported package dependencies.
- Inspect and validate a progressive proposal before Apply.
- Suggest a focused repair after failed execution feedback.

The agent cannot:

- Apply, execute, or deploy a change autonomously.
- Edit raw project JSON, persistent IDs, documentation files, assets, metadata, or deployment settings.
- Use shell, filesystem, generic HTTP, MCP, credential, or environment-value tools.
- Install arbitrary npm packages or select arbitrary package versions.

Generated syntax validation does not replace full TypeScript, bundle, or deployment validation.

## Operation and Package Discovery

The agent searches the current catalog instead of receiving a complete catalog in its prompt. Discovery can include core operations, enabled package operations, project operations, and operations created earlier in the current proposal.

The normal flow is **search**, then inspect exact operation details. Discovery results use opaque, host-owned handles. Handles are scoped to the current run; unknown or stale handles are rejected rather than guessed.

## Proposal, Validation, Apply, and Execution

An agent edit follows this lifecycle:

1. Inspect the selected operation and relevant project context.
2. Search and describe exact operations or supported packages.
3. Build a progressive proposal with host-generated IDs.
4. Run deterministic schema, reference, scope, type, normalization, and generated-syntax checks.
5. Review diagnostics and the semantic change summary.
6. Choose **Apply**, **Reject**, **Revise**, or **Regenerate**.
7. After Apply, the existing worker may execute the selected operation and return bounded feedback.

Apply rechecks project, thread, proposal, and staleness boundaries. A stale or invalid proposal is rejected without mutation. Execution feedback is reported as `succeeded`, `failed`, `cancelled`, or `not_run`.

Failed execution may produce a focused repair proposal, but every repair requires another explicit **Apply**. The agent does not retry execution or Apply by itself.

## Threads, Persistence, Undo, and Redo

Each project can have multiple independent agent threads. Threads, drafts, messages, active-thread selection, proposal links, and agent edit history are stored in the browser's IndexedDB.

Active runs are cancelled on reload and are not resumed. Agent edit history keeps up to 50 entries per project. Undo and redo require the current project to match the recorded state; a conflicting manual change blocks the action. A new edit after undo clears the redo branch.

## Providers, API Keys, and Proxy

Logicflow supports usage-based API-key billing through these providers and models:

| Provider  | Models                             |
| --------- | ---------------------------------- |
| Google    | Gemini 2.5 Flash, Gemini 2.5 Pro   |
| OpenAI    | GPT 5.1 Codex Mini, GPT 5.1 Codex  |
| Anthropic | Claude Sonnet 4.5, Claude Opus 4.6 |

Logicflow does not provide subscription-backed or local-runtime providers. Agent requests use the configured proxy. Leave `VITE_API_PROXY_URL` empty for local development; Vite forwards `/api/ai/*` to the sibling Worker at `http://localhost:8787`. Set `VITE_API_PROXY_URL` to the absolute URL of the deployed `logicflow-proxy` Worker in production. The Worker must allow the app origin:

```bash
ALLOWED_ORIGIN=http://localhost:3000
```

The client uses fixed provider routes: `/ai/openai`, `/ai/anthropic`, and `/ai/google`. The proxy must allow the app origin through CORS, preserve streaming responses, and support request cancellation. The client reports cancellation, timeouts, unauthorized keys, rate limits, unavailable providers, and other request failures without silently falling back to a direct provider request.

## Data Sharing and Security

Only the selected provider receives an agent request. Depending on the request, the provider may receive:

- The user's prompt and relevant operation context.
- Relevant project text, operation documentation, literal values, names, and catalog metadata.
- Proposal diagnostics and the generated explanation.
- Sanitized, bounded post-Apply execution feedback.

Provider keys, deployment credentials, platform tokens, project references, and environment values remain outside model context. Project content, catalog metadata, provider responses, and execution output or errors are untrusted data, not instructions.

Execution feedback is limited to depth 4, 20 items per collection, 500 characters per string, 10 errors, and 8,000 serialized UTF-8 bytes. Known provider, deployment, environment, and execution-specific values are redacted on a best-effort basis. Truncated feedback is marked **Feedback was truncated**.

## Supported Package Policy

The agent can use only packages in Logicflow's host-supported catalog. Package changes are explicit enable or disable proposals and discovery is scoped to the current proposal.

Arbitrary npm names, versions, installation commands, npm search, and package downloads are not supported. Disabling or deleting a package is rejected while proposed or existing operations still reference it.

## Deployment Requests

Deployment remains owned by the **Deployment** panel:

- An explicit deployment-only request creates an **Open Deployment panel** action without a model call.
- A combined edit-and-deploy request offers that action only after the proposal is applied and execution succeeds.
- The action does not navigate automatically; the user must click **Open Deployment panel**.
- Platform credentials, project references, environment values, and the final **Deploy** click remain in the panel.
- Deployment failures stay in the panel and are not automatically retried by the agent.

See [Deployment](#deployment) for platform setup and environment variables.

## Troubleshooting

- **Agent tab is missing:** Set `VITE_APP_ENABLE_AGENT_PANEL=true` and restart the development server.
- **API key required:** Add a key for the selected model's provider. Keys are tab-local and must be entered again in a new tab or session.
- **Unauthorized or rate-limited:** Check the provider key, provider account, and usage limits.
- **Timeout, cancellation, or unavailable provider:** Retry after checking the provider status and network connection. No direct-provider fallback is used.
- **Proxy or CORS failure:** Check `VITE_API_PROXY_URL`, the proxy's fixed routes, and its allowed app origin. Production builds do not use Vite's local proxy.
- **Stale proposal:** Reinspect the current operation and generate a new proposal; do not reuse a proposal after the project changes.
- **`not_run` feedback:** The Apply may have succeeded while execution did not start or finish. Review the project and worker status before trying another Apply.
- **Truncated feedback:** The output exceeded a safety bound. Use the bounded summary and avoid relying on omitted values.
- **Package-load failure:** Confirm the package is in the supported catalog and try enabling it again from Settings.
