# Logicflow

Logicflow is a live, block-based visual programming environment built around data transformation through chained operations.

It provides a structure editor for creating programming logic by chaining operations, with real-time execution, code generation, and one-click deployment.

Watch the [demo video](https://youtu.be/qzS_zw1iwS0) for an overview.

See [documentation](https://logicflow.dev/docs) for more details.

## Key Features

### Core Editor

- **Simple mental model**: Programming is operations chained after data, with no extra syntax to learn.
- **Block-based structure editor**: Create logic by chaining operations on data in a text-like linear format with drag-free, keyboard-driven interaction.
- **Real-time execution**: See execution results at each step as you build. Track how data transforms through operation chains with off-main-thread Web Worker execution.
- **Skipped execution tracking**: Visual indicators for unreachable code in conditional operations via type narrowing.
- **Undo/Redo**: Per-file history tracking (up to 50 levels) with Undo (`Cmd/Ctrl+Z`) and Redo (`Cmd/Ctrl+Shift+Z`).
- **Project checkpoints**: Snapshot-based versioning — create, restore, and delete named checkpoints at any point.

### Operations & NPM Packages

Logicflow ships with a rich set of operations from popular NPM libraries:

- **Remeda** (`pipe`, `map`, `filter`, `sort`, `groupBy`, `reduce`, `pick`, `omit`, and many more) — functional data transformation utilities.
- **Immer** (`produce`) — immutable state updates with a mutable API.
- **Wretch** (`url`, `get`, `post`, `headers`, `json`, `body`, `res`) — type-safe HTTP client as chainable operations.
- **Rowguard** (`table`, `enableRLS`, `policy`, `useSelect`, `useInsert`) — Row-Level Security policy builder for Supabase.
- **Faker** (261 operations across 28 namespaces: `person`, `string`, `number`, `date`, `location`, etc.) — fake data generation.
- **date-fns** (243 operations: `format`, `addDays`, `differenceInDays`, `isBefore`, etc.) — date manipulation.
- **FFmpeg** (virtual package, no npm dependency) — FFmpeg command builder with operations like `input`, `output`, `videoCodec`, `audioCodec`, `format`, `size`, `fps`, and more.

Packages can be enabled or disabled per project and given custom aliases or namespaces.

### Code Generation

- **Visual operations to TypeScript/JavaScript**: Every program generates clean, readable code using Remeda's functional `pipe()`/`pipeAsync()` patterns.
- **Operation source mapping**: Correctly maps built-in ops, Remeda ops, instance methods, and user-defined operations to their code equivalents.
- **Prettier-formatted output**: Generated code is automatically formatted.

### Deployment

- **One-click deployment** to **Vercel** (Edge Functions + Node.js fallback) and **Supabase** (Edge Functions).
- **HTTP triggers**: Turn any operation into an API endpoint with configurable HTTP methods, CORS settings, and environment variables.
- **Deployment history**: Track all deployments per project with status, timestamps, and deployment URLs.
- **Platform config generation**: Automatically generates `vercel.json`, `package.json`, and entrypoint wrappers.

### Type System

- **Primitive types**: `string`, `number`, `boolean`, `undefined`.
- **Complex types**: `array`, `tuple`, `object`, and `dictionary` with nested properties.
- **Special types**: `operation`, `condition`, `union` (multiple type options), `error` (with four error variants), `reference` (variables), `instance` (Date, URL, Promise, etc.), `unknown`, and `never`.
- **Type inference**: Automatic type inference from data values and operations.
- **Type compatibility checking**: Deep structural type comparison.
- **Type narrowing**: Context-aware type refinement that automatically skips unreachable branches.

### Error Handling

- **Errors as first-class data**: Error entities can be passed around and handled like any other data.
- **Error types**: `runtime_error`, `type_error`, `reference_error`, and `custom_error` (user-defined).
- **Error propagation**: Errors propagate through operation chains automatically.
- **Error boundaries**: React error boundaries isolate rendering failures to individual entities.

### Project Management & Persistence

- **Dashboard**: Create, open, and delete projects from a project list view.
- **IndexedDB persistence**: All project data (files, operations, settings, and checkpoints) is stored locally via IndexedDB.
- **Per-project settings**: Package management, layout preferences, and deployment configuration.
- **Built-in documentation viewer**: Markdown-based documentation accessible from within the app at `/docs`.
- **Responsive layout**: Adaptive UI with mobile support and a line wrapping toggle.

### Keyboard Navigation

- **Arrow keys**: Navigate between statements and operations.
- **Cmd/Ctrl + Arrow keys**: Jump to statement or operation boundaries.
- **Alt + Arrow keys**: Cycle through operations within a statement.
- **Backspace / Alt + Backspace**: Delete the focused element.
- **Escape**: Close dropdowns and the details panel.
- **Ctrl + Space**: Open the operation dropdown.
- **Alt + =**: Add an operation call.
- **Ctrl + Shift + 1/2/3/4**: Switch sidebar tabs.

### UI Features

- **Syntax highlighting**: Color-coded types, variables, methods, strings, and numbers via prism-react-renderer.
- **Searchable dropdowns**: Type-filtered, searchable dropdowns for data types and operations.
- **Details panel**: Side panel showing type information and execution results with the ability to lock/pin to a specific entity.
- **Tabbed sidebar**: Operations list, Details, Deployment, and Settings.
- **Resizable panels**: Drag to resize sidebar and details panels.

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- Yarn (package manager)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/logicflow.git
cd logicflow

# Install dependencies
yarn install

# Copy environment variables
cp .env.example .env.local
```

### Development

```bash
# Start the dev server (opens at http://localhost:3000)
yarn dev

# Run tests
yarn test

# Run tests with coverage
yarn test --coverage

# Build for production
yarn build

# Preview production build
yarn preview
```

### Environment Variables

| Variable             | Description                                |
| -------------------- | ------------------------------------------ |
| `VITE_API_PROXY_URL` | API proxy URL for deployment platform APIs |

## Tech Stack

- **UI**: React 18, Mantine, Tailwind CSS v4.
- **State**: Zustand with Immer immutable updates and IndexedDB persistence.
- **Execution**: Web Workers for off-main-thread real-time execution.
- **Validation**: Zod schemas for runtime type safety.
- **Routing**: React Router v7.
- **Testing**: Vitest with jsdom and @testing-library/react.
- **Build**: Vite 6 with TypeScript.

## License

[AGPL v3.0 License](LICENSE)
