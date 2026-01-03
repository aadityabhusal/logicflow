# Getting Started

Logicflow makes building programs visual and intuitive. This guide will walk you through creating your first program.

## Creating a Project

When you first open Logicflow, you'll see the Dashboard where all your projects are managed.

1. Click the **Create project** button
2. Your new project is created with a default "main" file
3. The project opens automatically in the editor

![Dashboard with 'Create project' button and project list](/docs-images/getting-started-01.png)

Each project can contain multiple files (operations), making it easy to organize related logic.

## Understanding the Interface

The editor has three main areas:

- **Sidebar**: Lists all files in your project (toggle with keyboard shortcut)
- **Editor Canvas**: Where you build your program by adding statements
- **Details Panel**: Shows execution results and type information (toggle with keyboard shortcut)

![Logicflow's editor interface](/docs-images/getting-started-02.png)

## Creating Your First Program

Let's build a simple program to print `Hello World` and also count its length.

### Step 1: Add Data

Click on the 'Add statement' `+` button to create your first data. Start by entering a value `"Hello"`. Logicflow detects this as a string and assigns it the `string` type. You'll see the result displayed in real-time in the Details panel.

![Create statement and enter a value](/docs-images/getting-started-03.gif)

### Step 2: Chain an Operation

Now, click on the 'Add operation call' `+` button at the right edge of the data to chain an operation. An operation chained after a data is called/invoked with the data as an input and gives out a result data so that other operations could be further chained after it.

Operations are filtered based on the data type they can accept. Since you have a string, only string operations appear.

![Add an operation call after the data](/docs-images/getting-started-04.gif)

### Step 3: Create and use a Variable

Click the equals sign (`=`) next to any statement to assign its result to a variable. Variables can be reused throughout your program. Once assigned, they appear in the dropdown when you need to reference data.

Create a new statement below and reference your variable. Select the variable name from the dropdown to use the variable and chain operations after it.

![Create a variable and use it](/docs-images/getting-started-05.gif)

## Real-time Execution

Every statement executes immediately as you build. Click any statement to see its result and type in the Details panel. Errors, when they occur, are displayed inline exactly where they occur.

## Next Steps

- Use different data types (numbers, booleans, arrays) and their operations
- Try creating larger programs with complex logic
- Create additional operation files from the sidebar to organize your code
