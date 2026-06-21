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

function toImportAlias(name: string) {
  const alias = name.replace(/[^a-zA-Z0-9_$]/g, "_");
  if (!alias) return "operation";
  return /^[a-zA-Z_$]/.test(alias) ? alias : `op_${alias}`;
}

export function generatePlatformHandlers(
  platform: DeploymentTarget["platform"],
  triggeredOps: ProjectFile[],
  opts?: { nodejs?: boolean; hasFileAssets?: boolean }
): GeneratedHandler[] {
  if (triggeredOps.length === 0) return [];

  switch (platform) {
    case "vercel":
      return generateVercelHandlers(
        triggeredOps,
        opts?.nodejs,
        opts?.hasFileAssets
      );
    case "supabase":
      return generateSupabaseHandlers(triggeredOps);
    default:
      return [];
  }
}

function generateVercelHandlers(
  triggeredOps: ProjectFile[],
  nodejs?: boolean,
  hasFileAssets?: boolean
): GeneratedHandler[] {
  return triggeredOps.map((op) => ({
    filename: `api/${op.name}.js`,
    content: nodejs
      ? generateVercelNodeHandler(op.name, hasFileAssets)
      : generateVercelEdgeHandler(op.name, hasFileAssets),
  }));
}

function fileAssetImport(path: string, hasFileAssets?: boolean): string {
  return hasFileAssets
    ? `import { configureFileAssets } from '${path}';\n`
    : "";
}

function fileAssetBaseUrlCall(hasFileAssets?: boolean): string {
  return hasFileAssets
    ? `\n  configureFileAssets({ baseUrl: new URL('/', request.url).href, headers: request.headers });\n`
    : "";
}

function generateVercelEdgeHandler(
  name: string,
  hasFileAssets?: boolean
): string {
  const alias = toImportAlias(name);
  return `import ${alias} from '../src/${name}.js';
${fileAssetImport("../src/lib/built-in.js", hasFileAssets)}

export const config = { runtime: 'edge' };

${corsHeaders}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
${fileAssetBaseUrlCall(hasFileAssets)}

  try {
    const result = await ${alias}(request);

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

function generateVercelNodeHandler(
  name: string,
  hasFileAssets?: boolean
): string {
  const alias = toImportAlias(name);
  return `import ${alias} from '../src/${name}.js';
${fileAssetImport("../src/lib/built-in.js", hasFileAssets)}

${corsHeaders}

export default async function handler(req, res) {
  for (const [key, value] of Object.entries(corsHeaders)) {
    res.setHeader(key, value);
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
${
  hasFileAssets
    ? "\n  configureFileAssets({\n    baseUrl: `${req.headers['x-forwarded-proto'] ?? 'https'}://${req.headers.host}/`,\n    headers: req.headers,\n  });\n"
    : ""
}

  try {
    const result = await ${alias}(req);

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
    const alias = toImportAlias(op.name);
    const handlerContent = `import ${alias} from '../../../src/${op.name}.js';
${corsHeaders}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const result = await ${alias}(request);

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
