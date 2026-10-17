/** Read-only organization of existing tickets. No task content or DB migration. */
export const taskCategories = [
  { id: "security", label: "SECURITY & security" },
  { id: "research", label: "Customer discovery" },
  { id: "finance", label: "Finance & billing" },
  { id: "brand", label: "Brand & marketing" },
  { id: "company", label: "Company & operations" },
  { id: "other", label: "Other tasks" },
] as const;
export type TaskCategory = (typeof taskCategories)[number]["id"];
export type TaskCategoryFilter = "all" | "non-security" | TaskCategory;
export function taskCategory(title: string): TaskCategory {
  if (/\b(security|hitrust|cybersecurity)\b/i.test(title)) return "security";
  if (/\b(research|research|interview|discovery)\b/i.test(title)) return "research";
  if (/\b(stripe|quickbooks|expenses?|billing|payments?|finance)\b/i.test(title)) return "finance";
  if (/\b(branding|brand|marketing|campaign)\b/i.test(title)) return "brand";
  if (/\b(llc|company|operations?|setup)\b/i.test(title)) return "company";
  return "other";
}
export function matchesTaskCategory(title: string, filter: TaskCategoryFilter) {
  const category = taskCategory(title);
  return (
    filter === "all" || (filter === "non-security" ? category !== "security" : category === filter)
  );
}
export function isTaskCategoryFilter(value: string): value is TaskCategoryFilter {
  return value === "all" || value === "non-security" || taskCategories.some((c) => c.id === value);
}
