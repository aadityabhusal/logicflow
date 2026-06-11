import { ProjectFile, DeploymentTarget } from "../types";

export interface GeneratedHandler {
  filename: string;
  content: string;
}

const corsHeaders = `const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};`;

export function generatePlatformHandlers(
  platform: DeploymentTarget["platform"],
  triggeredOps: ProjectFile[],
  opts?: { nodejs?: boolean }
): GeneratedHandler[] {
  if (triggeredOps.length === 0) return [];

  switch (platform) {
    case "vercel":
      return generateVercelHandlers(triggeredOps, opts?.nodejs);
    case "supabase":
      return generateSupabaseHandlers(triggeredOps);
    default:
      return [];
  }
}

function generateVercelHandlers(
  triggeredOps: ProjectFile[],
  nodejs?: boolean
): GeneratedHandler[] {
  return triggeredOps.map((op) => ({
    filename: `api/${op.name}.js`,
    content: nodejs
      ? generateVercelNodeHandler(op.name)
      : generateVercelEdgeHandler(op.name),
  }));
}

function generateVercelEdgeHandler(name: string): string {
  return `import ${name} from '../src/${name}.js';

export const config = { runtime: 'edge' };

${corsHeaders}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const result = await ${name}(request);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}
`;
}

function generateVercelNodeHandler(name: string): string {
  return `import ${name} from '../src/${name}.js';

${corsHeaders}

export default async function handler(req, res) {
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const result = await ${name}(req);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
    );
  }
}
`;
}

function generateSupabaseHandlers(
  triggeredOps: ProjectFile[]
): GeneratedHandler[] {
  return triggeredOps.map((op) => {
    const handlerContent = `import ${op.name} from '../../../src/${op.name}.js';

${corsHeaders}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const result = await ${op.name}(request);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
`;

    return {
      filename: `supabase/functions/${op.name}/index.js`,
      content: handlerContent,
    };
  });
}
