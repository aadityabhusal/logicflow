import { describe, expect, it } from "vitest";
import {
  createOperationFile,
  testArray,
  testReference,
} from "../tests/helpers";
import { createStatement } from "../lib/utils";
import { createExampleFiles } from ".";

describe("createExampleFiles", () => {
  it("remaps project-operation references while preserving local references", () => {
    const main = createOperationFile("main");
    const helper = createOperationFile("helper");
    const local = createStatement({ name: "value" });
    main.content.value.statements = [
      local,
      createStatement({ data: testReference("value", local.id) }),
      createStatement({ data: testReference("main", main.id) }),
      createStatement({
        data: testArray([
          createStatement({ data: testReference("helper", helper.id) }),
        ]),
      }),
    ];

    const files = createExampleFiles([main, helper]);
    const createdMain = files[0];
    const createdHelper = files[1];
    expect(createdMain.id).not.toBe(main.id);
    expect(createdHelper.id).not.toBe(helper.id);
    if (createdMain.type !== "operation") throw new Error("Expected operation");
    expect(createdMain.content.value.statements[1].data.value).toEqual({
      name: "value",
      id: local.id,
    });
    expect(createdMain.content.value.statements[2].data.value).toEqual({
      name: "main",
      id: createdMain.id,
    });
    expect(
      (
        createdMain.content.value.statements[3].data
          .value as typeof main.content.value.statements
      )[0].data.value,
    ).toEqual({ name: "helper", id: createdHelper.id });
  });
});
