import { ProjectFile, DeploymentTarget } from "../../types";

export interface GeneratedHandler {
  filename: string;
  content: string;
}

export function generatePlatformHandlers(
  platform: DeploymentTarget["platform"],
  triggeredOps: ProjectFile[]
): GeneratedHandler[] {
  if (triggeredOps.length === 0) return [];

  switch (platform) {
    case "vercel":
      return generateVercelHandlers(triggeredOps);
    case "netlify":
      return generateNetlifyHandlers(triggeredOps);
    case "supabase":
      return generateSupabaseHandlers(triggeredOps);
    default:
      return [];
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
