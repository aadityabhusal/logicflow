# Logicflow

Logicflow is a block-based structured editor built on the principle that **all programming is operations done on data**. It provides a visual interface for creating programming logic through a series of data transformations through chained operations along with real-time execution and code generation capabilities.

See [documentation](https://logicflow.dev/docs) for more details.

## Editor Features

### Core Features

- **Simple mental model**: All programming is Operations chained after Data. No additional concepts or syntax to learn.
- **Block-based editor**: Create logic by chaining operations on data in a structured, text-like linear format.
- **Real-time execution**: See execution results at each step as you build. Track how data transforms through operation chains.
- **Skipped execution tracking**: Visual indicators for unreachable code in conditional operations.
- **Undo/Redo**: Per-file history tracking with Undo(_Cmd/Ctrl+Z_) and Redo(_Cmd/Ctrl+Shift+Z_).

### Keyboard Navigation

- **Arrow keys**: Navigate between statements and operations
- **Cmd/Ctrl + Arrow keys**: Jump to statement/operation boundaries
- **Alt + Arrow keys**: Navigate between operations within a statement
- **Backspace/Alt + Backspace**: Delete focused element
- **Escape**: Close dropdowns and details panel
- **Ctrl + Space**: Open operation dropdown
- **Alt + =**: Add operation call

### UI Features

- **Syntax highlighting**: Color-coded types (variables, types, methods, strings, numbers, etc.)
- **Dropdown search**: Searchable operation and data type dropdowns
- **Details panel**: Side panel showing type information and execution results

## Language Features

### Core Entities

**Data**:

- Represents a typed data value.
- Can be a primitive value such as string, number, boolean, undefined, null, etc.
- Can be a complex value such as array, object, operation, union, reference, error, etc.

**Statement**: A variable statement with operations

- Has a Data entity followed by a series of chained Operation entities.
- Can be assigned a `name` to create a variable and be referenced.

**Operation**

- First-class data entities that contain a series of Statement entities that are executed to produce a result.
- Can be created either as a file or a Data entity type.
- Can be called/invoked by either using a `call` operation or by chaining after compatible data and operations.

### Type System

- **Primitive types**: `string`, `number`, `boolean`, `undefined`
- **Complex types**: `array`, `object` with nested properties
- **Special types**: `operation`, `union` (multiple type options), `error`, `unknown`, `never`
- **Type inference**: Automatic type inference from data values and operations.
- **Type compatibility checking**: Deep structural type comparison.
- **Type narrowing**: Context-aware type refinement based on conditions.

### Error Handling

- Errors as a first-class data entity that can be handled like any other data.
- Different error types, including runtime errors, type errors, reference errors, and custom user-defined errors.

## License

[AGPL v3.0 License](LICENSE)
