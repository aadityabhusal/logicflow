# Introduction

Logicflow is a block-based visual programming environment that helps you build programming logic by chaining operations on data. Unlike node-based tools, it provides a structured, text-like editor where you can visually create programming logic and see real-time output results.

## The Problem

Traditional visual programming tools either sacrifice capability for simplicity or become too complex for non-developers. Writing code requires understanding syntax, managing dependencies, and debugging errors that are often unclear. Logicflow bridges this gap by making programming more accessible without compromising on power.

## Philosophy

Logicflow is built on a core principle: **programming is simply operations on data**. Every feature and architectural decision aligns with this functional, data-transformation paradigm.

![Data transforms and flows through operations](/docs-images/introduction-01.gif)

## Core Principles

- **Operations transform data**: Each operation takes data as input and produces new data as output
- **Real-time execution**: See results inline at each step as you build, making debugging instant
- **Type safety first**: A complete type system ensures operations are valid and catches errors before they happen
- **Functional composition**: Build programs by composing operations rather than writing imperative control flow

## Key Features

- **Structured editor** with keyboard navigation for efficient workflow
- **First-class operations** - operations themselves are data that can be passed around
- **Type narrowing** - automatically skip unreachable branches based on type checks
- **Code generation** - export production-ready TypeScript code
- **Error handling** - first-class error data type that can be passed around and handled like any other data

![Logicflow program with advanced data types like arrays, operations and errors](/docs-images/introduction-02.png)
