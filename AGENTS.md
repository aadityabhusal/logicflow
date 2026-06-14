# Agent Guide

## Rules and Preferences

- Always keep the solution simple, concise, and minimal without losing any feature, behavior, or readability.
- Always follow existing project patterns and match the coding style of the existing codebase. For example, Do not add return types to functions unless they are useful or already match the existing style.
- Never stage changes unless explicitly asked, and avoid destructive git commands.
- Inspect the codebase before making configuration or tooling changes. For example, use the existing package manager instead of assuming `npm`.
- Use subagents whenever possible for focused research, exploration, or parallelizable work.
- Always ask before making broad architectural or configuration changes. Mention risks or follow-ups clearly.
- When working on a substantial feature, create a Markdown file in `/local` with the necessary details, tasks, and progress notes, and keep it updated as work progresses.
- When working on a feature, ask clarifying questions when requirements, tradeoffs, or implementation details are unclear, and be open to discussing the approach with the user.
- Finish necessary post-feature tasks such as creating tests, updating docs, or noting follow-ups.
- Never compromise on test quality. If a high-quality test is difficult or impractical, discuss the tradeoff with the user.
- When asked for suggestions or feasibility, analyze the pros and cons thoroughly and present a detailed report so the user can decide.

## Updating This Guide

- Add new rules only after repeated issues or clear preferences emerge. Remove rules that no longer help.
