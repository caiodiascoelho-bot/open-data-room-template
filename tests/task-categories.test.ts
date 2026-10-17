import { describe, expect, it } from "vitest";
import { isTaskCategoryFilter, matchesTaskCategory, taskCategory } from "../lib/task-categories";

describe("Task category organization", () => {
  it("keeps all SECURITY phases together without using private descriptions", () => {
    expect(taskCategory("SECURITY CODE 01 | P0 - Real RBAC")).toBe("security");
    expect(taskCategory("SECURITY | Organizational pilot readiness program")).toBe("security");
    expect(taskCategory("Research research 04 | SECURITY migration research")).toBe("security");
  });
  it("distinguishes discovery, billing, branding and operations", () => {
    expect(taskCategory("Research research 01 | Align with Research")).toBe("research");
    expect(taskCategory("Stripe")).toBe("finance");
    expect(taskCategory("Atualizar Planilha Expenses")).toBe("finance");
    expect(taskCategory("Branding")).toBe("brand");
    expect(taskCategory("LLC Setup")).toBe("company");
    expect(taskCategory("Put all tasks from Wpp chat with TEAMMATE")).toBe("other");
  });
  it("All and Without SECURITY preserve unrelated tickets and statuses", () => {
    const titles = [
      "SECURITY 01",
      "Research research 01",
      "Stripe",
      "Branding",
      "LLC Setup",
      "Other",
    ];
    expect(titles.filter((t) => matchesTaskCategory(t, "all"))).toHaveLength(6);
    expect(titles.filter((t) => matchesTaskCategory(t, "non-security"))).toEqual(titles.slice(1));
    expect(titles.filter((t) => matchesTaskCategory(t, "finance"))).toEqual(["Stripe"]);
  });
  it("rejects stale or unexpected saved filter values", () => {
    expect(isTaskCategoryFilter("all")).toBe(true);
    expect(isTaskCategoryFilter("non-security")).toBe(true);
    expect(isTaskCategoryFilter("security")).toBe(true);
    expect(isTaskCategoryFilter("deleted-folder")).toBe(false);
  });
});
