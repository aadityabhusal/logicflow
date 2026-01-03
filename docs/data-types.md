# Data Types

Logicflow has a comprehensive type system that ensures operations are valid and safe. Each data type stores specific values and supports particular operations.

## Primitive Types

### string

Stores text values wrapped in quotes.

**Value**: `"Hello World"`

**Operations**: `concat`, `includes`, `slice`, `split`, `toUpperCase`, `toLowerCase`, `getLength` etc.

### number

Stores numeric values including integers and decimals.

**Value**: `42` or `3.14`

**Operations**: `add`, `subtract`, `multiply`, `divide`, `power`, `lessThan`, `greaterThan`, `toRange` etc.

![Division by zero returns an error type](/docs-images/data-types-01.png)

### boolean

Stores true or false values.

**Value**: `true` or `false`

**Operations**: `and`, `or`, `not`, `thenElse` etc.

The `and` and `or` operations use lazy evaluation—they only execute their second parameter if needed.

![The lazily evaluated parameter of the 'and' operation is skipped because of being unreachable](/docs-images/data-types-02.png)

### undefined

Represents the absence of a value.

**Value**: `undefined`

**Usage**: Default value for uninitialized data or optional parameters.

## Complex Types

### array

Stores ordered collections of elements with the same type. Arrays are typed by their element type (e.g., `array<string>`).

**Value**: `[1, 2, 3]` or `["a", "b", "c"]`

**Operations**: `get`, `getLength`, `concat`, `map`, `filter`, `find`, `sort` etc.

### object

Stores key-value pairs where each property has its own type. Each property maintains its own type information.

**Value**: `{ name: "John", age: 30 }`

**Operations**: `get`, `has`, `keys`, `values` etc.

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

## Special Types

### error

Represents runtime, type, reference or custom errors. Errors are displayed inline where they occur and are propagated through the operation chain. Errors are treated as first-class data types, and can be passed around and handled like any other data.

**Value**: Holds the error reason message

**Types**: `Reference Error`, `Type Error`, `Runtime Error`, `Custom Error`

### reference

References a variable by name.

**Value**: Holds the variable name and ID

**Usage**: Automatically created when selecting variables from dropdowns. Resolves to the actual data during execution.
