# Code Generation

Logicflow can generate executable TypeScript/JavaScript code from your visual operations. The generated code uses functional composition patterns and is ready to run or deploy.

## How It Works

Each operation file is converted into an exported function. Statements become chained operations using Remeda's `pipe` (or `pipeAsync` for async) functions, where data flows through a series of transformations:

```typescript
import * as R from "remeda";
import * as _ from "../built-in";

export default (name: string) => R.pipe(name, _.concat("Hello! "));
```

### Operation Sources

Generated code pulls operations from different sources depending on their origin:

- **Built-in** (`import * as _ from "../built-in"`) — Custom runtime helpers (type guards, polymorphic operations). Used as `_.operationName`.
- **Remeda** (`import * as R from "remeda"`) — Functional utility library for data transformation. Used as `R.operationName`.
- **Instance** — Operations on instance types (Date, URL, Wretch, etc.) are generated as arrow functions: `(arg) => arg.methodName()`.
- **User-defined** (`import { operationName } from "./operationName"`) — Your other operation files in the same project.

### Async Operations

When a statement contains an `await` operation, the generated code uses `await R.pipeAsync` instead of `R.pipe`:

```typescript
export default async () =>
  await R.pipeAsync("https://api.example.com/data", _.fetch, R.json);
```

The `await` operation itself is not emitted as a function call — it triggers the switch to `pipeAsync` and the `await` prefix on the statement.

### Call Operation

The `call` operation invokes a user-defined operation with arguments. It's generated as an arrow function inside the pipe:

```typescript
R.pipe(data, (arg) => myOperation(arg, extraArg));
```

## Code Panel

The Code Panel in the sidebar shows a live preview of the generated code for the currently selected operation. It updates as you edit your operation.

Toggle the Code Panel using the sidebar tab with the code icon, or press **Ctrl+Shift+3**. Copy the code using the copy button in the panel header.

## Generated Code Format

The output is formatted using Prettier. If Prettier formatting fails, the raw generated code is shown as a fallback.
