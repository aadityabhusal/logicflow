# Introduction

Logicflow is a visual programming editor built around one idea: **programming is data transformation**.

You start with data, chain operations to transform it, and see how the data changes at each step.

## Intro Video

```youtube
cRjEcBACr6U
```

## The Core Idea

Most programs can be understood as a chain of transformations:

- Start with data.
- Apply an operation to it.
- Get new data back.
- Keep going.

That simple structure is the center of Logicflow. A string can become an uppercase string. A list can be filtered. A request can become a response. The shape of the data changes, but the mental model stays the same.

More advanced ideas, like unions, promises, recursion, and error values, are still available. They appear when you need them, not before.

![Logicflow program with advanced data types like arrays, operations, and errors](/docs-images/introduction-02.png)

## Why Logicflow Exists

Many visual programming tools look friendly, but become either too rigid for developers or still too complex for beginners.

Logicflow keeps the surface simple without hiding what matters: data, operations, and the result of each step.

## Feedback While You Build

Logicflow runs your program as you build it. You do not only see the final output. You can click through the chain and inspect how the data changed after each operation.

This makes debugging more direct. If something breaks, you can usually see where the data stopped matching your expectation.

![Data transforms and flows through operations](/docs-images/introduction-01.gif)

## Accessible By Design

Logicflow does not require a programming setup, an account, or a constant internet connection. Install it once as a progressive web app, and it can run locally on your device.

It is also designed to be usable on a phone, using buttons, dropdowns, and structured controls. That matters when a shared smartphone may be the only computing device available.

## A Bridge To Code

Logicflow is not meant to replace traditional programming. It helps early developers build a stronger foundation by understanding data shapes, following how values change, and staying close to JavaScript semantics.

The generated TypeScript/JavaScript code closely matches the visual program, so the code is not hidden behind the interface.

## Technical Overview

For a deeper look at the type system, execution model, code generation, deployment, and package support, watch the technical overview.

```youtube
qzS_zw1iwS0
```

## Features You Can Grow Into

- **Live execution**: Inspect intermediate results, not just the final result.
- **Static typing**: Catch invalid operations before they run, with operations filtered by the data they can accept.
- **Type narrowing**: Automatically skip unreachable branches based on type checks.
- **First-class operations**: Pass operations around as data.
- **Recursion and error handling**: Build more serious programs, with errors represented as data you can pass around and handle.
- **Keyboard navigation**: Work efficiently without depending only on the mouse.
- **Code generation**: Read the TypeScript/JavaScript behind your visual program.
- **Deployment and npm packages**: Turn Logicflow programs into serverless endpoints and use packages from the JavaScript ecosystem.
