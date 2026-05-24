# Additional Features

## Sidebar Panels

The sidebar provides access to different tools through tabs:

- **Operations** — Lists all operation files in your project. Add, rename, and delete operations.
- **Details** — Shows type information and execution results for the selected data or operation call.
- **Code** — Displays the generated TypeScript/JavaScript code for the current operation. See [Code Generation](#code-generation).
- **Deploy** — Configure deployment settings for your project. Add platforms (Vercel or Supabase), manage API tokens and environment variables, and deploy trigger operations as live HTTP endpoints. See [Deployment](#deployment) for details.
- **Settings** — Configure project-wide settings including project name, package dependencies, UI preferences, and **project checkpoints**.

Click a tab to open it. Click the same tab again to close it and collapse the sidebar. See [Keyboard Shortcuts](#keyboard-shortcuts) for the full list.

The Details panel can be locked to a specific item using the lock button, so it stays visible even when navigating elsewhere.

## Project Checkpoints

Checkpoints let you save and restore snapshots of your entire project. They're manual safety points you can return to if you need to revert changes.

Checkpoints are managed in the **Settings** tab of the sidebar, under the project name.

### Creating a Checkpoint

1. Open the **Settings** tab
2. Enter an optional name in the checkpoint input
3. Click the save button

A checkpoint captures:
- All operation files and their contents
- Project settings (name, dependencies)
- Deployment configuration (platforms, environment variables)

Checkpoints do **not** capture the project ID or creation date — those are preserved when restoring.

### Restoring a Checkpoint

Click the restore icon next to a checkpoint to see a confirmation popover. Restoring overwrites your current project with the checkpoint snapshot.

If the file you were viewing exists in the restored checkpoint, you'll stay on it. If it doesn't exist, the editor shows an empty state and you can select a file from the sidebar.

### Deleting a Checkpoint

Click the delete icon next to a checkpoint to see a confirmation popover. Deleting removes only that checkpoint.

All checkpoints for a project are also cleaned up when the project itself is deleted.

### Storage

Checkpoints are stored locally in your browser's IndexedDB. They are not synced across devices or to any cloud service.

## Copy and Paste

The editor header provides copy and paste buttons for working with operations:

### Copy

Copies the current operation as JSON to the clipboard. This includes all statements, data, operations, and parameters—but excludes the operation name.

### Paste

Pastes an operation from the clipboard. The pasted content is validated against the operation schema before being merged into the current operation. Invalid content is rejected silently.

This is useful for duplicating operations or sharing them between projects.

## Type Narrowing

Type narrowing automatically refines union types based on type checks, making unreachable code paths explicit.

### How It Works

When you use type-checking operations like `isTypeOf` on a union type, Logicflow narrows the type in subsequent operations. The type in each branch reflects only the possible types for that path.

![After the type check, `data` is a `string` in true branch, and a `number` in false branch](/docs-images/additional-features-02.gif)

### Type Guard Operations

Logicflow provides type guard operations that check types and narrow them in conditional branches. These include `isArray`, `isBoolean`, `isNumber`, `isString`, `isDate`, `isError`, `isFunction`, `isPlainObject`, `isPromise`, `isDefined`, and `isObjectType`. See [Type Guard Operations](#type-guard-operations) for the full list.

### Unreachable Branches

When boolean operations like `and`, `or`, or `thenElse` make a branch unreachable, Logicflow skips its execution.

![Example with 'and' operation](/docs-images/data-types-02.png)

### Lazy Evaluation

Operations like `and`, `or`, and `thenElse` use lazy evaluation. They only execute branches when needed:

- `and`: Only evaluates second parameter if first is `true`
- `or`: Only evaluates second parameter if first is `false`
- `thenElse`: Only executes the reachable branch

This enables type narrowing to skip unreachable code safely.

## Error Handling

Logicflow displays errors inline exactly where they occur, using React error boundaries to isolate failures.

### Error Types

Logicflow recognizes four error categories:

- **Reference Error**: Variable not found in context
- **Type Error**: Operation parameter has wrong type
- **Runtime Error**: Operation fails during execution
- **Custom Error**: User-defined error messages

![Error types example](/docs-images/additional-features-03.png)

### Error Propagation

When an operation produces an error, it propagates through the entire chain to the outer context for proper handling. The error passes through subsequent operations without executing them.

Chained operations skip execution but forward the error, ensuring it reaches the outer context where it can be displayed and handled. This allows errors to bubble up correctly while preventing invalid operations from running.

### Error Boundaries

Each entity (data, operation, statement) has its own error boundary. This isolates errors to specific parts of your program without breaking the entire application.

Errors show:

- The error message
- The error type (reference, type, runtime, custom)
- Location highlighted in the editor

Errors can be removed by clicking the close button or fixing the underlying issue.

![Error boundary isolation example](/docs-images/additional-features-04.png)

### No Try-Catch Blocks

Logicflow avoids traditional try-catch blocks. Instead, errors become data of type `error` that can be checked and handled using type operations.

## Asynchronous Operations

Logicflow supports asynchronous operations through Promise types and async operations. The type system tracks async flows and ensures proper handling.

### Promises and Async Flow

Operations that return Promises (like `fetch` or HTTP methods) produce `Promise` instance types. These can be:

- **Chained** with `then` to transform resolved values
- **Handled** with `catch` for error recovery
- **Resolved** with `await` to get the final value

![Promise chaining flow with fetch, then and await](/docs-images/additional-features-05.png)

### HTTP Requests

Logicflow provides two ways to make HTTP requests:

#### Native Fetch

The built-in `fetch` operation provides a direct interface to the browser's Fetch API. Chain it after a URL string to make a GET request, or pass a dictionary of options to configure method, headers, and body. The result is a `Response` instance. Fetch results are cached to prevent redundant requests.

#### Wretch HTTP Client

[Wretch](https://elbywan.github.io/wretch/) provides a fluent, chainable interface for HTTP requests with built-in error handling and configuration options. See the [Wretch](#wretch) and [WretchResponseChain](#wretchresponsechain) types under [NPM Packages](#npm-packages) for available operations.

### Triggered Operations

Operations marked as triggers are exposed as HTTP endpoints when deployed. Triggered operations automatically receive an `HttpRequest` instance containing the incoming request's method, headers, body, query parameters, and path. Use the `HttpRequest` operations (`getMethod`, `getHeaders`, `getBody`, `getQuery`, `getPath`, `getHeader`) to access request data.

## Recursion

Operations can call themselves directly or indirectly through other operations. Each recursive call creates an **isolated context** — its own scope with independent variable bindings, ensuring that nested invocations don't interfere with each other.

Logicflow tracks call depth on each invocation. If the depth exceeds the maximum allowed limit (**7500**), execution stops and returns a runtime error: `Maximum recursion depth (7500) exceeded`.

For async operations, the engine yields to the browser periodically during recursive execution to keep the UI responsive.

## Background Execution

All real-time execution runs on a background thread, keeping the UI responsive even during complex or long-running operations. You can continue editing and navigating while execution is in progress.

## Operation Caching

Logicflow caches operation results to avoid redundant computation. When an operation is called with the same inputs it has seen before, the cached result is returned immediately without re-executing the operation.

### Clearing the Cache

The **"Clear cache and run"** button (circular arrow icon) in the editor header clears cached results and forces a full re-execution of all statements. Use this when you want to start fresh after making changes that depend on external state or side effects.

## Mobile Layout

Logicflow adapts its interface for smaller screens (below **768px** width) to remain usable on mobile devices and narrow viewports.

### Layout Changes

When the screen width drops below 768px:

- The **sidebar** moves below the editor canvas (bottom of the screen)
- **Resizable panels** adjust to vertical orientation
- **Keyboard navigation** may be disabled to avoid conflicts with on-screen keyboards

### Mobile Settings

Two additional settings appear in the Settings panel on mobile devices:

- **Disable keyboard focus** — Disables Logicflow's keyboard navigation system. Useful when using an on-screen keyboard where arrow keys would otherwise navigate between elements instead of moving the text cursor.
- **Disable code wrapping** — When enabled, the layout stays in desktop mode regardless of screen width. This treats the mobile browser as if it were a desktop viewport.

## External Documentation Links

When you select an operation from a library (Remeda, Wretch, Rowguard, or Faker) in the Details panel, Logicflow shows a link to the operation's official documentation.

- **Remeda operations**: [remedajs.com/docs](https://remedajs.com/docs)
- **Wretch operations**: [Wretch API documentation](https://elbywan.github.io/wretch/api/interfaces/index.Wretch.html)
- **Rowguard operations**: [Rowguard documentation](https://supabase-community.github.io/rowguard/)
- **Faker operations**: [Faker API documentation](https://fakerjs.dev/api/)
