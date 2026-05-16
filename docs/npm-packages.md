# NPM Packages

Logicflow supports several npm packages that extend its capabilities with HTTP clients, row-level security, and data generation.

## Wretch

The [Wretch](https://elbywan.github.io/wretch/) package provides a fluent, chainable HTTP client for making API requests. Operations are grouped by the wretch API.

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

## Rowguard

The [Rowguard](https://supabase-community.github.io/rowguard/) package provides a type-safe query builder for Supabase Row Level Security policies.

### ColumnBuilder

Builds column expressions with comparison and membership operators for row-level security rules. Created from a column name string.

**Value**: A ColumnBuilder instance

**Operations**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `contains`, `isNull`, `isNotNull`, `isOwner`, `isPublic`, `belongsToTenant`, `isMemberOf`, `userBelongsTo`, `releasedBefore`

For the full list, see the [Rowguard ColumnBuilder documentation](https://supabase-community.github.io/rowguard/classes/ColumnBuilder.html).

### PolicyBuilder

Creates row-level security policies with fine-grained access control. Supports read, write, update, and delete operations with permissive or restrictive modes.

**Value**: A PolicyBuilder instance created with an optional table name string

**Operations**: `on`, `for`, `read`, `write`, `update`, `delete`, `all`, `to`, `when`, `withCheck`, `allow`, `restrictive`, `permissive`, `requireAll`, `allowAny`, `description`, `generatePolicyName`, `toDefinition`, `toSQL`

For the full list, see the [Rowguard PolicyBuilder documentation](https://supabase-community.github.io/rowguard/classes/PolicyBuilder.html).

### SubqueryBuilder

Builds subqueries for use within Rowguard column conditions.

**Value**: A SubqueryBuilder instance created from a table name string and optional alias

**Operations**: `select`, `where`, `join`, `toSubquery`

For the full list, see the [Rowguard SubqueryBuilder documentation](https://supabase-community.github.io/rowguard/classes/SubqueryBuilder.html).

### Structural Operations

Rowguard provides structural operations for working with Supabase session context:

- **`auth.uid`** — Returns the authenticated user's ID as a context value
- **`session.get`** — Retrieves a session variable (e.g., `org_id`) with a specified session type (e.g., `uuid`)
- **`toSQL`** — Converts conditions and context values to SQL expressions

For the full list of Rowguard operations, see the [Rowguard modules documentation](https://supabase-community.github.io/rowguard/modules.html).

## Faker

The [Faker](https://fakerjs.dev/) package generates massive amounts of realistic fake data for testing and development. All 261 operations across 28 namespaces are available.

Faker operations follow the `namespace.method` naming convention and generate values directly:

- **`person.firstName`** — Random first name (string)
- **`string.uuid`** — Random UUID (string)
- **`number.int`** — Random integer (number)
- **`date.past`** — Random date in the past (Date)
- **`internet.email`** — Random email address (string)
- **`company.name`** — Random company name (string)
- **`finance.amount`** — Random monetary amount (string)

All Faker operations accept an optional configuration object parameter. For the complete list of all 28 namespaces and 261 operations, see the [Faker API documentation](https://fakerjs.dev/api/).
