import { Project, ProjectFile } from "../../types";

export interface GeneratedHandler {
  filename: string;
  content: string;
}

export function generatePlatformHandlers(
  project: Project,
  triggeredOps: ProjectFile[]
): GeneratedHandler[] {
  const deployment = project.deployment;
  if (!deployment) {
    throw new Error("Project has no deployment configuration");
  }

  if (triggeredOps.length === 0) {
    throw new Error("No triggered operations found");
  }

  switch (deployment.platform) {
    case "vercel":
      return generateVercelHandlers(triggeredOps);
    case "netlify":
      return generateNetlifyHandlers(triggeredOps);
    case "supabase":
      return generateSupabaseHandlers(triggeredOps);
    default:
      throw new Error(
        `Unsupported platform: ${(deployment as Record<string, string>).platform}`
      );
  }
}

function generateVercelHandlers(
  triggeredOps: ProjectFile[]
): GeneratedHandler[] {
  return triggeredOps.map((op) => {
    const operationName = op.name;
    const handlerContent = `import { ${operationName} } from '../src/operations/${operationName}.js';

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const body = request.body ? await request.json() : undefined;
    const query = Object.fromEntries(url.searchParams.entries());

    const httpRequest = {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      query,
      path: url.pathname,
    };

    const result = await ${operationName}(httpRequest);

    return new Response(JSON.stringify(result), {
      status: result.status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
`;

    return { filename: `api/${operationName}.js`, content: handlerContent };
  });
}

function generateNetlifyHandlers(
  triggeredOps: ProjectFile[]
): GeneratedHandler[] {
  return triggeredOps.map((op) => {
    const operationName = op.name;
    const handlerContent = `import { ${operationName} } from '../../src/operations/${operationName}.js';

export default async (request) => {
  try {
    const url = new URL(request.url);
    const body = request.body ? await request.json() : undefined;
    const query = Object.fromEntries(url.searchParams.entries());

    const httpRequest = {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      query,
      path: url.pathname,
    };

    const result = await ${operationName}(httpRequest);

    return new Response(JSON.stringify(result), {
      status: result.status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
`;

    return {
      filename: `netlify/functions/${operationName}.js`,
      content: handlerContent,
    };
  });
}

function generateSupabaseHandlers(
  triggeredOps: ProjectFile[]
): GeneratedHandler[] {
  return triggeredOps.map((op) => {
    const operationName = op.name;
    const handlerContent = `import { ${operationName} } from '../../../../src/operations/${operationName}.js';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const body = req.body ? await req.json() : undefined;
    const query = Object.fromEntries(url.searchParams.entries());

    const httpRequest = {
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      body,
      query,
      path: url.pathname,
    };

    const result = await ${operationName}(httpRequest);

    return new Response(JSON.stringify(result), {
      status: result.status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
`;

    return {
      filename: `supabase/functions/${operationName}/index.js`,
      content: handlerContent,
    };
  });
}
