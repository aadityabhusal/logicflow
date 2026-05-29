# Introduction

Logicflow is a live, block-based visual programming environment built around data transformation through chained operations.

Put simply, Logicflow is built on a core principle: **programming is operations performed on data**. You create data and chain operations to transform it.

In Logicflow, you can see live execution results for every chained operation and visualize how data flows and transforms through each step.

![Data transforms and flows through operations](/docs-images/introduction-01.gif)

## Video Overview

Watch a short introduction to see how Logicflow works in practice.

```youtube
qzS_zw1iwS0
```

## The Problem

Traditional visual programming tools either sacrifice capability for simplicity or become too complex for non-developers. Writing code requires understanding syntax, managing dependencies, and debugging errors that are often unclear. Logicflow bridges this gap by making programming more accessible without compromising on power.

## Core Principles

- **Operations transform data**: Each operation takes data as input and produces new data as output.
- **Real-time execution**: See results inline at each step as you build, making debugging immediate.
- **Type safety first**: A complete type system ensures operations are valid and catches errors before they happen.
- **Functional composition**: Build programs by composing operations rather than writing imperative control flow.

## Key Features

- **Structure editor** with keyboard navigation for an efficient workflow.
- **First-class operations**: Operations themselves are data that can be passed around.
- **[Type narrowing](#type-narrowing)**: Automatically skip unreachable branches based on type checks.
- **[Code generation](#code-generation)**: Live preview of generated TypeScript/JavaScript code.
- **[Error handling](#error-handling)**: First-class error data type that can be passed around and handled like any other data.

![Logicflow program with advanced data types like arrays, operations, and errors](/docs-images/introduction-02.png)
