import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Resizer } from "./Resizer";

describe("Resizer keyboard accessibility", () => {
  it("resizes a sidebar with arrow, Home, and End keys", () => {
    const setPanelSize = vi.fn();
    render(
      <Resizer
        type="width"
        value={300}
        minSize={200}
        maxSize={500}
        setPanelSize={setPanelSize}
      />
    );
    const separator = screen.getByRole("separator", {
      name: "Resize sidebar width",
    });

    expect(separator.getAttribute("aria-orientation")).toBe("vertical");
    expect(separator.getAttribute("aria-valuenow")).toBe("300");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.keyDown(separator, { key: "End" });

    expect(setPanelSize.mock.calls).toEqual([
      [{ width: 310 }],
      [{ width: 290 }],
      [{ width: 200 }],
      [{ width: 500 }],
    ]);
  });

  it("uses Up to enlarge the bottom mobile panel", () => {
    const setPanelSize = vi.fn();
    render(
      <Resizer
        type="height"
        direction="negative"
        value={300}
        minSize={200}
        maxSize={500}
        setPanelSize={setPanelSize}
      />
    );
    const separator = screen.getByRole("separator", {
      name: "Resize panel height",
    });

    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
    fireEvent.keyDown(separator, { key: "ArrowUp" });
    fireEvent.keyDown(separator, { key: "ArrowDown" });

    expect(setPanelSize.mock.calls).toEqual([
      [{ height: 310 }],
      [{ height: 290 }],
    ]);
  });
});
