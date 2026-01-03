# Core Concepts

Understanding a few key concepts will help you build effectively in Logicflow.

## Data

Data is the fundamental building block. Every value in Logicflow—strings, numbers, booleans, arrays, objects—is data with a specific type. Data carries type information that determines which operations can be applied to it. The type system ensures operations are valid before execution.

![String, number and boolean data](/docs-images/core-concepts-01.png)

## Statements

A statement is a named or unnamed piece of data with operations chained to it. Statements are the visual equivalent of code expressions. Each statement executes independently and displays its result in real-time.

Every statement has three parts:

- **Name** (optional): The variable name for reusing the result
- **Data**: The initial value
- **Operations**: Transformations applied in sequence

![Unnamed and named statements](/docs-images/core-concepts-02.png)

## Operations

Operations transform data from one type to another. They're filtered based on what data type they accept as their first parameter. Operations can optionally accept additional parameters beyond the data being transformed:

![Operations transforming data](/docs-images/core-concepts-03.gif)

### Operation Types

- **Built-in operations**: Provided by Logicflow (concat, add, map, etc.)
- **User-defined operations**: Operations you create become available as chainable functions

When you create an operation (file) and give it a name, it appears in the operations list and can be chained like any built-in operation.

### Chaining Operations

The power of Logicflow comes from chaining operations together. Each operation receives the result of the previous operation as its first parameter.

User-defined operations can be both chained after data and be called/invoked by chaining a `call` operation after the user-defined operation.

![A user-defined operation being both chained and called](/docs-images/core-concepts-04.png)

### Operations as Data

Operations themselves are first-class data. You can pass them as parameters to higher-order operations like `sort`, `map`, `filter` etc.:

![An operation passes as parameter data to sort operation](/docs-images/core-concepts-05.png)

## Variables

Assign a name to any statement by clicking the equals sign (`=`) or typing a name before the data. Once named, variables appear in dropdowns throughout your program. Select them to reference the stored value.

![Variable dropdown showing available variables](/docs-images/core-concepts-06.png)

### Variable Scope

Variables are available within the same file (operation). To use logic from one file in another, reference the file name as an operation.

### Reserved Names

You cannot use data type names (string, number, boolean, etc.) as variable names—these are reserved.

### Context

Logicflow maintains a context that tracks all available variables and their current values. This context ensures operations have access to the data they need and enables real-time execution.
