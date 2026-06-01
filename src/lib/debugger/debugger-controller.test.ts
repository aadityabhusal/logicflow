import { describe, expect, it } from "vitest";
import { createDebugControlBuffer } from "./control-buffer";
import { createDebuggerController } from "./debugger-controller";
import { createTestContext, testNumber, testOperation } from "@/tests/helpers";

describe("createDebuggerController", () => {
  it("clears flow per statement and records operation calls only", () => {
    const { control } = createDebugControlBuffer(3);
    const controller = createDebuggerController({
      runId: "run",
      control,
      results: new Map(),
      getContexts: () => new Map(),
      pauseOnExceptions: false,
      entityFileMap: new Map([
        ["data-1", "file"],
        ["data-2", "file"],
        ["op-1", "file"],
        ["op-2", "file"],
      ]),
    });
    const context = createTestContext({ debugger: controller });
    const data1 = { ...testNumber(1), id: "data-1" };
    const data2 = { ...testNumber(2), id: "data-2" };
    const op1 = { ...testOperation([], [], "first"), id: "op-1" };
    const op2 = { ...testOperation([], [], "second"), id: "op-2" };

    controller.resetFlow();
    controller.beforeData(data1, context);
    expect(controller.getFlowSteps()).toEqual([]);
    controller.beforeOperationCall(op1, context, data1);
    controller.beforeData({ ...testNumber(100), id: "param" }, context);
    controller.exitData();
    controller.afterOperationCall(op1, context, testNumber(10));
    controller.exitData();
    expect(controller.getFlowSteps()).toHaveLength(1);
    expect(controller.getFlowSteps()[0].operationName).toBe("first");

    controller.resetFlow();
    controller.beforeData(data2, context);
    expect(controller.getFlowSteps()).toEqual([]);
    controller.beforeOperationCall(op2, context, data2);
    controller.afterOperationCall(op2, context, testNumber(20));
    controller.exitData();

    const steps = controller.getFlowSteps();
    expect(steps).toHaveLength(1);
    expect(steps[0].operationName).toBe("second");
    expect(steps[0].input?.value).toBe(2);
    expect(steps[0].output?.value).toBe(20);
  });
});
