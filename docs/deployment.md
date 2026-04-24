# Deployment

Logicflow can deploy your operations as live HTTP endpoints to serverless platforms. This lets you turn visual operations into real APIs that can be called from anywhere.

## HTTP Triggers

An operation marked as a **trigger** is exposed as an HTTP endpoint when deployed. Trigger operations automatically receive an `HttpRequest` instance as their input, containing the request's method, headers, body, query parameters, and path.

### Creating a Trigger

To create a trigger, click the "+" button in the Operations sidebar tab and select "Trigger" instead of "Operation". Trigger operations are indicated by a globe icon in the sidebar.

### Configuring a Trigger

Each trigger can be configured with:

- **Path** — The URL path for the endpoint (e.g., `/hello` or `/api/users`). If not set, the operation name is used as the path.
- **Methods** — Which HTTP methods the endpoint accepts. If not set, all methods are accepted.
- **CORS** — Cross-origin resource sharing settings including allowed origins, methods, headers, and credentials.

### Handling Requests

Inside a trigger operation, the input data is an `HttpRequest` instance. You can use the following operations to access request data:

- `getMethod` — Returns the HTTP method as a string (GET, POST, etc.)
- `getHeaders` — Returns all headers as a dictionary
- `getHeader` — Returns a specific header value by name
- `getBody` — Returns the request body
- `getQuery` — Returns query parameters as a dictionary
- `getPath` — Returns the request path

Use these operations to build request handlers, validate inputs, and route logic based on the incoming request.

### Response Format

Trigger operations should return the data you want to send back in the response body. The deployment platform automatically wraps the result in a JSON response with a `200` status code. If your operation throws an error, the platform returns a `500` response with the error message.

## Supported Platforms

Logicflow supports deploying to two platforms:

- **Vercel** — Deploys as Edge Functions using the Vercel Edge runtime
- **Supabase** — Deploys as Edge Functions using Deno

You can configure one or both platforms for a project and deploy to each independently.

## Platform Setup

Before deploying, you need to authenticate with your chosen platform.

### Vercel

1. Go to your [Vercel account tokens page](https://vercel.com/account/tokens)
2. Click "Create Token" and give it a name
3. Copy the generated token
4. In Logicflow, open the Deploy panel, add Vercel as a platform, and paste the token into the credentials popover

Vercel projects are created automatically using your Logicflow project name. If a project with that name already exists in your Vercel account, it will be reused.

### Supabase

1. Go to your [Supabase account tokens page](https://supabase.com/dashboard/account/tokens)
2. Generate a new access token
3. Copy your project reference from the Supabase dashboard URL or project settings
4. In Logicflow, open the Deploy panel, add Supabase as a platform, and paste both the access token and project reference into the credentials popover

Supabase deploys functions to a specific project, so the project reference is required.

## Environment Variables

Environment variables let you store configuration values that should not be hardcoded in your operations, such as API keys or database URLs.

### Managing Variables

In the Deploy panel, under "Environment Variables", you can add, edit, and remove variables. Each variable has a key and a value.

### How They Work

- Environment variables are stored in your project's deployment configuration
- When you deploy, they are pushed to the platform and become available to your operations at runtime
- In your operations, reference environment variables using the `env` operation or by creating a reference with `isEnv` set to `true`

Keep tokens and sensitive values in environment variables rather than in operation data.

## Deploying Your Project

### Requirements

At least one operation must be marked as an HTTP trigger before deploying. If no triggers exist, deployment will fail with an error.

### Deployment Process

1. Open the Deploy panel from the sidebar
2. Configure your platform credentials
3. Add any environment variables you need
4. Click the **Deploy** button for your chosen platform

Logicflow will guide you through the deployment stages:

- **Generating** — Converts your visual operations into JavaScript files, generates platform-specific handlers, and resolves dependencies
- **Uploading** — Sends the generated files to the platform
- **Building** — The platform builds and provisions your endpoints
- **Ready** — Your endpoints are live and accessible

If any stage fails, the error message is displayed in the Deploy panel.

### Deployment History

Each platform keeps a history of deployments. The most recent deployment shows:

- **Status** — Ready, building, or error
- **Timestamp** — When the deployment completed
- **Dashboard** — A link to the platform's dashboard for managing the project
- **Live Endpoints** — Direct links to your trigger endpoints

Click a live endpoint link to open it in a new tab. For Vercel, endpoints are available at `/api/<operation-name>`. For Supabase, they are available at the Supabase Functions URL.

### Removing a Platform

You can remove a platform from your project at any time. This only removes the configuration from Logicflow and does not delete the project or deployments from the platform's dashboard.
