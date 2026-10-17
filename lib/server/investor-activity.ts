import type { Identity } from "./auth";
import { id, now, one, run } from "./storage";
export async function recordInvestorView(
  user: Identity,
  action: string,
  target: string,
  label: string,
) {
  if (user.role !== "viewer") return;
  const share = await one<{ label: string }>(
    "SELECT s.label FROM viewers v JOIN shares s ON s.id=v.share_id WHERE v.id=?",
    user.id,
  );
  const cutoff = new Date(Date.now() - 60000).toISOString();
  await run(
    "INSERT INTO investor_activity(id,viewer_id,name,email,share_label,action,target,label,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM investor_activity WHERE viewer_id=? AND action=? AND target=? AND created_at>?)",
    id(),
    user.id,
    user.name,
    user.email,
    share?.label || "Private link",
    action,
    target,
    label,
    now(),
    user.id,
    action,
    target,
    cutoff,
  );
}
