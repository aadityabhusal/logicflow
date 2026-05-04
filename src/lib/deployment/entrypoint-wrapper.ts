import { ProjectFile, DeploymentTarget } from "../types";

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
    const handlerContent = `import ${op.name} from '../src/operations/${op.name}.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  try {
    const result = await ${op.name}(request);

    return new Response(JSON.stringify(result), {
      status: 200,
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

    return { filename: `api/${op.name}.js`, content: handlerContent };
  });
}

function generateSupabaseHandlers(
  triggeredOps: ProjectFile[]
): GeneratedHandler[] {
  return triggeredOps.map((op) => {
    const handlerContent = `import ${op.name} from '../../../src/operations/${op.name}.js';

Deno.serve(async (request) => {
  try {
    const result = await ${op.name}(request);

    return new Response(JSON.stringify(result), {
      status: 200,
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
      filename: `supabase/functions/${op.name}/index.js`,
      content: handlerContent,
    };
  });
}
