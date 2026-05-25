import { describe, expect, it } from "vitest";
import {
  filterTasks,
  isTaskCategory,
  isTaskStatus,
  TASK_CATEGORY_VALUES,
  TASK_STATUS_VALUES,
} from "./admin-filter";

const ROWS = [
  { status: "open", taskCategory: "schedule_request" },
  { status: "open", taskCategory: "manual_quote" },
  { status: "completed", taskCategory: "schedule_request" },
  { status: "canceled", taskCategory: "issue_review" },
  { status: "open", taskCategory: "service_area_review" },
];

describe("isTaskStatus / isTaskCategory", () => {
  it("accepts every known value", () => {
    for (const s of TASK_STATUS_VALUES) expect(isTaskStatus(s)).toBe(true);
    for (const c of TASK_CATEGORY_VALUES) expect(isTaskCategory(c)).toBe(true);
  });
  it("rejects unknown / casing variants", () => {
    expect(isTaskStatus("Open")).toBe(false);
    expect(isTaskStatus("")).toBe(false);
    expect(isTaskCategory("nope")).toBe(false);
  });
});

describe("filterTasks", () => {
  it("returns the full list when no filters set", () => {
    expect(filterTasks(ROWS, {})).toHaveLength(5);
    expect(
      filterTasks(ROWS, { status: "all", category: "all" }),
    ).toHaveLength(5);
  });
  it("filters by status", () => {
    expect(filterTasks(ROWS, { status: "open" })).toHaveLength(3);
    expect(filterTasks(ROWS, { status: "completed" })).toHaveLength(1);
    expect(filterTasks(ROWS, { status: "canceled" })).toHaveLength(1);
  });
  it("filters by category", () => {
    expect(filterTasks(ROWS, { category: "schedule_request" })).toHaveLength(2);
    expect(filterTasks(ROWS, { category: "manual_quote" })).toHaveLength(1);
  });
  it("combines status + category with AND", () => {
    expect(
      filterTasks(ROWS, { status: "open", category: "schedule_request" }),
    ).toHaveLength(1);
    expect(
      filterTasks(ROWS, { status: "completed", category: "manual_quote" }),
    ).toHaveLength(0);
  });
  it("treats empty / null as no-op", () => {
    expect(
      filterTasks(ROWS, { status: "", category: null }),
    ).toHaveLength(5);
  });
});
