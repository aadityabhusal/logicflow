# Data Types

Logicflow has a comprehensive type system that ensures operations are valid and safe. Each data type stores specific values and supports particular operations.

## Primitive Types

### string

Stores text values wrapped in quotes.

**Value**: `"Hello World"`

**Operations**: `concat`, `includes`, `slice`, `split`, `toUpperCase`, `toLowerCase`, `getLength`, `localeCompare`

### number

Stores numeric values including integers and decimals.

**Value**: `42` or `3.14`

**Operations**: `add`, `subtract`, `multiply`, `divide`, `power`, `mod`, `lessThan`, `greaterThan`, `lessThanOrEqual`, `greaterThanOrEqual`, `toRange`

![Division by zero returns an error type](/docs-images/data-types-01.png)

### boolean

Stores true or false values.

**Value**: `true` or `false`

**Operations**: `and`, `or`, `not`, `thenElse`

The `and` and `or` operations use lazy evaluation—they only execute their second parameter if needed.

![The lazily evaluated parameter of the 'and' operation is skipped because of being unreachable](/docs-images/data-types-02.png)

### undefined

Represents the absence of a value.

**Value**: `undefined`

**Usage**: Default value for uninitialized data or optional parameters.

## Complex Types

### array

Stores ordered collections of elements with the same type. Arrays are typed by their element type (e.g., `array<string>`).

**Value**: Holds a list of statements

**Operations**: `get`, `getLength`, `concat`, `map`, `filter`, `find`, `sort`, `join`

### tuple

Stores ordered collections with a fixed number of elements, where each element can have a different type. Tuples are useful for representing pairs, triples, or other fixed-length sequences.

**Value**: Holds a fixed-length list of statements with potentially different types

**Operations**: `get`, `getLength`, `join`

### object

Stores key-value pairs where each property has its own type. Each property maintains its own type information.

**Value**: Holds a Key-Statement pair map with string keys

**Operations**: `get`, `has`, `keys`, `values`, `entries`

### dictionary

Stores key-value pairs where all values share the same type. Unlike objects, dictionaries have a uniform value type across all entries.

**Value**: Holds a Key-Statement pair map with string keys and uniform value type

**Operations**: `get`, `has`, `keys`, `values`, `entries`, `merged`

## Advanced Types

### union

Represents a value that can be one of multiple types.

**Value**: Holds the value of the current active type matching one of its constituent types

**Usage**: Union types are created automatically when needed, such as from conditional branches. Switch between types using the dropdown button.

**Operations**: `isTypeOf` (Type checking operation)

Use union types to handle multiple possible types safely.

![Union type's options dropdown](/docs-images/data-types-03.png)

### operation

Operations are first-class data types that can be passed as parameters. Operations define their parameter types and return type is inferred from the last statement.

**Value**: Holds a set of parameters and statements

**Usage**:

- Create operations as files or data of a statement along with a variable name
- Chain them after compatible data or use the `call` operation to execute the operation with arguments
- Pass operations to higher-order operations like `map` and `filter`.

**Operations**: `call` (Executes the operation with arguments)

## Instance Types

Instance types wrap JavaScript objects and provide operations to interact with them. They enable integration with native JavaScript APIs and external libraries.

### Date

Wraps JavaScript's native Date object for date and time operations.

**Value**: A Date instance created with optional string parameter

**Operations**: `getFullYear`, `getMonth`, `getDate`, `getTime`, `getHours`, `getMinutes`, `getSeconds`, `toISOString`, `toDateString`

### URL

Wraps JavaScript's native URL object for parsing and manipulating URLs.

**Value**: A URL instance created from a string

**Operations**: `getHref`, `getOrigin`, `getProtocol`, `getHostname`, `getPort`, `getPathname`, `getSearch`, `getHash`, `toString`

### Promise

Represents asynchronous operations. Promises can be chained with `then`, handle errors with `catch`, and resolved with `await`.

**Value**: A Promise instance that resolves to a typed value

**Operations**: `then`, `catch`, `await`

### Response

Wraps the Fetch API Response object for handling HTTP responses.

**Value**: A Response instance from fetch operations

**Operations**: `json`, `text`, `getStatus`

## Special Types

### error

Represents runtime, type, reference or custom errors. Errors are displayed inline where they occur and are propagated through the operation chain. Errors are treated as first-class data types, and can be passed around and handled like any other data.

**Value**: Holds the error reason message

**Types**: `Reference Error`, `Type Error`, `Runtime Error`, `Custom Error`

### reference

References a variable by name.

**Value**: Holds the variable name and ID

**Usage**: Automatically created when selecting variables from dropdowns. Resolves to the actual data during execution.
