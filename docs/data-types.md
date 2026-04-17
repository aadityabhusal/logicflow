# Data Types

Logicflow has a comprehensive type system that ensures operations are valid and safe. Each data type stores specific values and supports particular operations.

## Primitive Types

### string

Stores text values wrapped in quotes.

**Value**: `"Hello World"`

**Operations**: `concat`, `includes`, `localeCompare`, `length`

For additional string operations such as `toUpperCase`, `toLowerCase`, `capitalize`, `toCamelCase`, `toKebabCase`, `toSnakeCase`, `toTitleCase`, `startsWith`, `endsWith`, `truncate`, `split`, `sliceString`, and more, see the [Remeda string operations](https://remedajs.com/docs).

### number

Stores numeric values including integers and decimals.

**Value**: `42` or `3.14`

**Operations**: `add`, `subtract`, `multiply`, `divide`, `power`, `mod`, `lessThan`, `greaterThan`, `lessThanOrEqual`, `greaterThanOrEqual`

![Division by zero returns an error type](/docs-images/data-types-01.png)

For additional number operations such as `ceil`, `floor`, `round`, `clamp`, `sum`, `product`, `mean`, `median`, `range`, `randomInteger`, `times`, and more, see the [Remeda number operations](https://remedajs.com/docs).

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

**Operations**: `at`, `indexOf`, `lastIndexOf`, `slice`, `concat`, `length`, `includes`, `some`, `every`, `join`, `toTuple`

For additional array operations such as `map`, `filter`, `find`, `findIndex`, `reduce`, `flatMap`, `sort`, `sortBy`, `unique`, `chunk`, `drop`, `take`, `flat`, `reverse`, `shuffle`, `zip`, `partition`, `groupBy`, `countBy`, `difference`, `intersection`, and many more, see the [Remeda array operations](https://remedajs.com/docs).

### tuple

Stores ordered collections with a fixed number of elements, where each element can have a different type. Tuples are useful for representing pairs, triples, or other fixed-length sequences.

**Value**: Holds a fixed-length list of statements with potentially different types

**Operations**: `at`, `length`, `join`, `toArray`

### object

Stores key-value pairs where each property has its own type. Each property maintains its own type information.

**Value**: Holds a Key-Statement pair map with string keys

**Operations**: `get`, `has`, `keys`, `values`, `entries`, `toDictionary`

For additional object operations such as `invert`, `fromEntries`, `pick`, `omit`, `pickBy`, `omitBy`, `merge`, `mergeAll`, `mergeDeep`, `mapKeys`, `mapValues`, `set`, `setPath`, `addProp`, `swapProps`, `evolve`, `prop`, `pathOr`, and more, see the [Remeda object operations](https://remedajs.com/docs).

### dictionary

Stores key-value pairs where all values share the same type. Unlike objects, dictionaries have a uniform value type across all entries.

**Value**: Holds a Key-Statement pair map with string keys and uniform value type

**Operations**: `get`, `has`, `keys`, `values`, `entries`, `toObject`

For additional dictionary operations, see the [Remeda object operations](https://remedajs.com/docs) (most object operations also work on dictionaries).

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

### condition

Represents a conditional branch (if-then-else). Created internally by the `thenElse` operation. The condition type's result is a union of the true and false branch types.

**Value**: Holds a condition statement, a true branch statement, and a false branch statement

**Usage**: Created automatically when using boolean operations like `thenElse`. Not directly selectable from the data type dropdown.

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

### Wretch

Wraps the [Wretch](https://elbywan.github.io/wretch/) HTTP client for fluent, chainable HTTP requests.

**Value**: A Wretch instance created from a URL string and optional options dictionary

**Operations**: `url`, `options`, `headers`, `accept`, `content`, `auth`, `body`, `json`, `fetch`, `get`, `post`, `put`, `patch`, `delete`, `head`, `opts`

For the full list of Wretch operations, see the [Wretch API documentation](https://elbywan.github.io/wretch/api/interfaces/index.Wretch.html).

### WretchResponseChain

Returned after calling an HTTP method on a Wretch instance. Provides response parsing and error handling.

**Value**: A WretchResponseChain instance

**Operations**: `res`, `json`, `text`

**Error handlers**: `error`, `badRequest` (400), `unauthorized` (401), `forbidden` (403), `notFound` (404), `timeout`, `internalError` (500), `fetchError`

Each error handler accepts an operation that receives the error and can return a fallback value. For the full list, see the [WretchResponseChain documentation](https://elbywan.github.io/wretch/api/interfaces/index.WretchResponseChain.html).

### HttpRequest

Received by triggered operations when deployed as API endpoints. Contains the incoming HTTP request data.

**Value**: An HttpRequest instance with method, headers, body, query, and path

**Operations**: `getMethod`, `getHeaders`, `getBody`, `getQuery`, `getPath`, `getHeader` (with header name parameter)

**Usage**: Created automatically for triggered operations. Not directly selectable from the data type dropdown.

## Special Types

### error

Represents runtime, type, reference or custom errors. Errors are displayed inline where they occur and are propagated through the operation chain. Errors are treated as first-class data types, and can be passed around and handled like any other data.

**Value**: Holds the error reason message

**Types**: `Reference Error`, `Type Error`, `Runtime Error`, `Custom Error`

### reference

References a variable by name.

**Value**: Holds the variable name and ID

**Usage**: Automatically created when selecting variables from dropdowns. Resolves to the actual data during execution.

## Type System Types

These types are part of the type system but are not directly selectable from the data type dropdown.

### unknown

The top type — represents any possible value. Used as a placeholder when the specific type cannot be determined.

### never

The bottom type — represents a value that can never exist. Used in unreachable code paths after type narrowing.

## Polymorphic Operations

Some operations work across multiple data types: `length` (string, array, tuple), `includes` (string, array), `concat` (string, array).

## Utility Operations

These operations work on any data: `toString`, `log`, `fetch`, `clone`, `tap`, `defaultTo`, `isDeepEqual`, `isShallowEqual`, `isIncludedIn`, `isEmpty`, `isEmptyish`, `isTruthy`. For detailed documentation, see the [Remeda docs](https://remedajs.com/docs).

## Type Guard Operations

Type guard operations check the type of a union value and narrow the type in subsequent operations: `isArray`, `isBoolean`, `isNumber`, `isString`, `isDate`, `isError`, `isFunction`, `isPlainObject`, `isPromise`, `isDefined`, `isObjectType`. For detailed documentation, see the [Remeda docs](https://remedajs.com/docs).

Type guards work with type narrowing — after a type guard check in a conditional branch, the type is automatically narrowed to the checked type. See [Type Narrowing](#type-narrowing) for more details.
