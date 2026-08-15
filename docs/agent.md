# Agent

The Agent panel turns a natural-language request into a reviewed update for the selected Logicflow operation. It never changes project state without an explicit **Apply**.

## Enable and Use the Agent Panel

Set the feature flag in `.env.local` and restart the app:

```bash
VITE_APP_ENABLE_AGENT_PANEL=true
```

Open the **Agent** tab, choose a model, add the provider API key, and send a request while an operation is selected. Drafts, messages, and chat threads are scoped to the current project. Active requests can be cancelled.

Keys, model selection, and thinking level are stored in this browser's IndexedDB. The selected provider receives the request and bounded operation context described below.

## Native Statement Updates

The model returns one structured update for the selected operation. It may:

- Insert, replace, delete, or move parameter statements.
- Insert, replace, delete, or move body statements.
- Enable up to three packages from Logicflow's supported package catalog.

Replacing a statement can express nested arrays, objects, conditions, callbacks, constructors, and call arguments because the payload uses Logicflow's native statement JSON. The host remaps new entity IDs and preserves the root ID of a replaced statement.

The Agent cannot create or delete operation files, directly edit another operation, disable packages, add arbitrary dependencies, change deployment settings, replace raw project JSON, or apply a proposal itself.

## Context and Lookup

The initial provider context contains:

- The complete selected operation.
- File metadata that must be preserved.
- Signatures for other project operations.
- Enabled and supported package summaries.
- Exact descriptors for operations already used by the selected operation.

When an exact operation descriptor is missing, the model may make one batched, read-only `lookup_operations` call. Lookup searches built-ins, project operations, enabled packages, and a disabled package only when its supported catalog key is explicitly named. It does not mutate the package registry.

The provider has no shell, filesystem, generic HTTP, credential, environment, mutation, execution, or Apply tools.

## Validation and Apply

An Agent edit follows this lifecycle:

1. Build bounded context for the selected operation.
2. Receive one native statement update, optionally after one lookup.
3. Apply the actions to an isolated candidate and remap new IDs.
4. Validate schemas, unique identities, lexical references, operation existence, chain and argument types, parameters, packages, callers, and generated syntax.
5. Review the action, package, caller, and diagnostic summaries.
6. Choose **Apply**, **Reject**, **Revise**, or **Regenerate**.

Apply verifies proposal ownership and staleness, reconstructs and validates the candidate again, and persists the project and chat atomically. A stale or invalid proposal is rejected without changing live state. Agent edits retain project-level undo and redo history.

Apply does not wait for execution, send execution results to a provider, or start an automatic repair. Logicflow's normal live execution remains independent.

## Providers and Proxy

Logicflow supports usage-based API-key billing through these providers and models:

| Provider  | Models                                         |
| --------- | ---------------------------------------------- |
| OpenAI    | GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.6 Luna       |
| Anthropic | Claude Fable 5, Claude Opus 5, Claude Sonnet 5 |

The composer exposes Low, Medium, High, XHigh, and Max thinking levels. Logicflow does not display raw chain-of-thought.

Agent requests use the configured proxy. Leave `VITE_API_PROXY_URL` empty for local development; Vite forwards `/api/ai/*` to the sibling Worker at `http://localhost:8787`. Set it to the deployed `logicflow-proxy` Worker URL in production. The Worker must allow the app origin:

```bash
ALLOWED_ORIGIN=http://localhost:3000
```

The client uses fixed `/ai/openai` and `/ai/anthropic` routes and never falls back to direct provider requests.

## Data Sharing and Security

The selected provider may receive:

- The user's request.
- The selected operation and preserved metadata summary.
- Other operation signatures and supported package metadata.
- Read-only lookup results when requested.
- A prior native update when revising a proposal.

Provider keys, deployment credentials, platform tokens, project references, environment values, unrelated file bodies, and execution results stay outside model context. Project content, package metadata, prior updates, and provider output are treated as untrusted data.

## Deployment Requests

Deployment remains owned by the **Deployment** panel. A deployment-only request offers an **Open Deployment panel** action without a model call. For an edit-and-deploy request, the action is offered after the proposal is applied. Credentials and the final **Deploy** action remain in the Deployment panel.

## Troubleshooting

- **Agent tab is missing:** Set `VITE_APP_ENABLE_AGENT_PANEL=true` and restart the development server.
- **API key required:** Add a key for the selected model's provider.
- **Unauthorized or rate-limited:** Check the provider key, account, and usage limits.
- **Timeout or cancellation:** Retry after checking provider and network status.
- **Proxy or CORS failure:** Check `VITE_API_PROXY_URL`, fixed routes, and the allowed app origin.
- **Stale proposal:** Regenerate against the current operation after the project changes.
- **Package-load failure:** Confirm the package is in the supported catalog and try again.
