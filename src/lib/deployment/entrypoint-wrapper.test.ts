import { describe, it, expect } from "vitest";
import { generatePlatformHandlers } from "@/lib/deployment/entrypoint-wrapper";
import { createTriggeredOperationFile } from "@/tests/helpers";

describe("generatePlatformHandlers", () => {
  const ops = [
    createTriggeredOperationFile("getUser"),
    createTriggeredOperationFile("createUser"),
  ];

  describe("dispatch", () => {
    it("returns empty array when no triggered ops", () => {
      expect(generatePlatformHandlers("vercel", [])).toEqual([]);
      expect(generatePlatformHandlers("supabase", [])).toEqual([]);
    });

    it("returns empty array for netlify platform even with triggered ops (not yet handled)", () => {
      expect(generatePlatformHandlers("netlify" as never, ops)).toEqual([]);
    });

    it("returns Vercel handlers for vercel platform", () => {
      const result = generatePlatformHandlers("vercel", ops);
      expect(result).toHaveLength(2);
      expect(result[0].filename).toMatch(/^api\//);
    });

    it("returns Supabase handlers for supabase platform", () => {
      const result = generatePlatformHandlers("supabase", ops);
      expect(result).toHaveLength(2);
      expect(result[0].filename).toMatch(/^supabase\/functions\//);
    });

    it("returns empty array for unknown platform", () => {
      expect(generatePlatformHandlers("unknown" as never, ops)).toEqual([]);
    });
  });

  describe("Vercel handlers", () => {
    it("has filename api/{name}.js", () => {
      const result = generatePlatformHandlers("vercel", ops);
      expect(result[0].filename).toBe("api/getUser.js");
      expect(result[1].filename).toBe("api/createUser.js");
    });

    it("contains edge runtime config", () => {
      const result = generatePlatformHandlers("vercel", ops);
      expect(result[0].content).toContain(
        "export const config = { runtime: 'edge' }"
      );
    });

    it("imports from ../src/operations/{name}.js", () => {
      const result = generatePlatformHandlers("vercel", ops);
      expect(result[0].content).toContain(
        "from '../src/operations/getUser.js'"
      );
    });

    it("uses export default async function handler pattern", () => {
      const result = generatePlatformHandlers("vercel", ops);
      expect(result[0].content).toContain(
        "export default async function handler(request)"
      );
    });
  });

  describe("Supabase handlers", () => {
    it("has filename supabase/functions/{name}/index.js", () => {
      const result = generatePlatformHandlers("supabase", ops);
      expect(result[0].filename).toBe("supabase/functions/getUser/index.js");
      expect(result[1].filename).toBe("supabase/functions/createUser/index.js");
    });

    it("contains Deno.serve", () => {
      const result = generatePlatformHandlers("supabase", ops);
      expect(result[0].content).toContain("Deno.serve");
    });

    it("imports from ../../../src/operations/{name}.js", () => {
      const result = generatePlatformHandlers("supabase", ops);
      expect(result[0].content).toContain(
        "from '../../../src/operations/getUser.js'"
      );
    });

    it("does not contain edge runtime config", () => {
      const result = generatePlatformHandlers("supabase", ops);
      expect(result[0].content).not.toContain("runtime");
    });
  });

  describe("common handler patterns", () => {
    it("contains try/catch", () => {
      const result = generatePlatformHandlers("vercel", ops);
      expect(result[0].content).toContain("try {");
      expect(result[0].content).toContain("} catch (error)");
    });

    it("returns JSON response on success", () => {
      const result = generatePlatformHandlers("vercel", ops);
      expect(result[0].content).toContain("JSON.stringify(result)");
      expect(result[0].content).toContain("status: 200");
    });

    it("returns 500 error response on catch", () => {
      const result = generatePlatformHandlers("vercel", ops);
      expect(result[0].content).toContain("status: 500");
    });

    it("uses error.message for Error instances with fallback", () => {
      const result = generatePlatformHandlers("vercel", ops);
      expect(result[0].content).toContain(
        "error instanceof Error ? error.message : 'Internal server error'"
      );
    });

    it("produces correct number of handler files for multiple operations", () => {
      const threeOps = [
        createTriggeredOperationFile("a"),
        createTriggeredOperationFile("b"),
        createTriggeredOperationFile("c"),
      ];
      expect(generatePlatformHandlers("vercel", threeOps)).toHaveLength(3);
      expect(generatePlatformHandlers("supabase", threeOps)).toHaveLength(3);
    });

    it("passes operation name through as-is even for names with special characters", () => {
      const weirdOp = [createTriggeredOperationFile("my_op$")];
      const result = generatePlatformHandlers("vercel", weirdOp);
      expect(result[0].filename).toBe("api/my_op$.js");
      expect(result[0].content).toContain(
        "import my_op$ from '../src/operations/my_op$.js'"
      );
      expect(result[0].content).toContain("await my_op$(request)");
    });
  });
});
