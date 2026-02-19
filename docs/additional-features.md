# Additional Features

## Keyboard Shortcuts

Logicflow is designed for efficient keyboard-first navigation.

### Arrow Key Navigation

- **Left/Right**: Move the caret through data, operations and buttons
- **Up/Down**: Move between statements
- **Alt + Left/Right**: Jump between data and operations skipping their text
- **Alt + Up/Down**: Jump to the parent i.e. focus from array item to parent array
- **Cmd/Ctrl + Left/Right**: Jump to first/last element in current statement
- **Cmd/Ctrl + Up/Down**: Jump to first/last statement of operation file.

Navigation respects text input cursor position—arrow keys move within text until you reach boundaries.

![Keyboard navigation flow](/docs-images/additional-features-01.gif)

### Editing Shortcuts

- **Cmd/Ctrl + Z**: Undo changes
- **Cmd/Ctrl + Shift + Z** or **Cmd/Ctrl + Y**: Redo changes
- **Enter**: Toggle boolean values or confirm input
- **Escape**: Close Details panel

### Focus Management

The focused element shows an outline border. Press arrow keys to navigate, and the focus automatically moves to appropriate elements.

## Type Narrowing

Type narrowing automatically refines union types based on type checks, making unreachable code paths explicit.

### How It Works

When you use type-checking operations like `isTypeOf` on a union type, Logicflow narrows the type in subsequent operations. The type in each branch reflects only the possible types for that path.

![After the type check, `data` is a `string` in true branch, and a `number` in false branch](/docs-images/additional-features-02.gif)

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

The built-in `fetch` operation provides a direct interface to the browser's Fetch API. Chain it after a URL string to make a GET request, or pass a dictionary of options to configure method, headers, and body.

#### Wretch HTTP Client

Wretch provides a fluent, chainable interface for HTTP requests with better error handling and configuration options.

**Configuration Operations**: `url`, `options`, `headers`, `accept`, `content`, `auth`, `body`, `json`

**HTTP Methods**: `get`, `post`, `put`, `patch`, `delete`, `head`

**Response Handling**: After calling an HTTP method, use `json`, `text`, or `res` to parse the response, then `await` to resolve the Promise.

**Error Handling**: Wretch provides specific error handlers:

- `badRequest` (400), `unauthorized` (401), `forbidden` (403), `notFound` (404)
- `timeout`, `internalError` (500), `fetchError`, `error` (any error)

Each error handler accepts an operation that receives the error and can return a fallback value.

### Async Execution

All operations support async handlers internally. When an operation is async:

- The execution result is cached to prevent redundant API calls
- Loading states are shown for pending operations
- Errors are caught and converted to error types
