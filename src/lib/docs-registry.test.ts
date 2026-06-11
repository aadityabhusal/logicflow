import { describe, expect, it } from "vitest";
import { getDocsUrl } from "./docs-registry";

describe("getDocsUrl", () => {
  it("returns undefined for missing source or operation name", () => {
    expect(getDocsUrl(undefined, "eq")).toBeUndefined();
    expect(getDocsUrl({ name: "supabaseBuilder" }, undefined)).toBeUndefined();
  });

  it("returns undefined for unknown source", () => {
    expect(getDocsUrl({ name: "unknown" }, "eq")).toBeUndefined();
  });

  it("generates modifier URLs for supabaseBuilder", () => {
    expect(getDocsUrl({ name: "supabaseBuilder" }, "limit")).toBe(
      "https://supabase.com/docs/reference/javascript/using-modifiers-limit"
    );
    expect(getDocsUrl({ name: "supabaseBuilder" }, "maybeSingle")).toBe(
      "https://supabase.com/docs/reference/javascript/using-modifiers-maybesingle"
    );
  });

  it("generates filter URLs for supabaseBuilder", () => {
    expect(getDocsUrl({ name: "supabaseBuilder" }, "eq")).toBe(
      "https://supabase.com/docs/reference/javascript/using-filters-eq"
    );
    expect(getDocsUrl({ name: "supabaseBuilder" }, "contains")).toBe(
      "https://supabase.com/docs/reference/javascript/using-filters-contains"
    );
  });

  it("generates standard URL for non-filter non-modifier operations", () => {
    expect(getDocsUrl({ name: "supabaseBuilder" }, "isDistinct")).toBe(
      "https://supabase.com/docs/reference/javascript/isdistinct"
    );
  });

  it("generates standard URLs for other supabase sources", () => {
    expect(getDocsUrl({ name: "supabaseClient" }, "from")).toBe(
      "https://supabase.com/docs/reference/javascript/from"
    );
    expect(getDocsUrl({ name: "supabaseQueryBuilder" }, "select")).toBe(
      "https://supabase.com/docs/reference/javascript/select"
    );
    expect(getDocsUrl({ name: "supabaseFunctions" }, "invoke")).toBe(
      "https://supabase.com/docs/reference/javascript/invoke"
    );
  });

  it("strips package prefix from operation name", () => {
    expect(getDocsUrl({ name: "supabaseBuilder" }, "supabase.limit")).toBe(
      "https://supabase.com/docs/reference/javascript/using-modifiers-limit"
    );
    expect(getDocsUrl({ name: "supabaseBuilder" }, "supabase.eq")).toBe(
      "https://supabase.com/docs/reference/javascript/using-filters-eq"
    );
  });
});
