export type WorkspaceRole = "Owner" | "Editor" | "Reviewer" | "Viewer";
export type WorkspaceAction =
  | "workspace:read"
  | "member:manage"
  | "limits:manage"
  | "store:connect"
  | "store:import"
  | "product:read"
  | "product:write"
  | "audit:read"
  | "audit:create"
  | "suggestion:read"
  | "suggestion:generate"
  | "suggestion:edit"
  | "suggestion:approve"
  | "suggestion:reject"
  | "publish:create"
  | "publish:export"
  | "job:run";

const ROLE_ACTIONS: Record<WorkspaceRole, ReadonlySet<WorkspaceAction>> = {
  Owner: new Set([
    "workspace:read",
    "member:manage",
    "limits:manage",
    "store:connect",
    "store:import",
    "product:read",
    "product:write",
    "audit:read",
    "audit:create",
    "suggestion:read",
    "suggestion:generate",
    "suggestion:edit",
    "suggestion:approve",
    "suggestion:reject",
    "publish:create",
    "publish:export",
    "job:run",
  ]),
  Editor: new Set([
    "workspace:read",
    "store:import",
    "product:read",
    "product:write",
    "audit:read",
    "audit:create",
    "suggestion:read",
    "suggestion:generate",
    "suggestion:edit",
    "publish:export",
    "job:run",
  ]),
  Reviewer: new Set([
    "workspace:read",
    "product:read",
    "audit:read",
    "suggestion:read",
    "suggestion:approve",
    "suggestion:reject",
  ]),
  Viewer: new Set(["workspace:read", "product:read", "audit:read", "suggestion:read"]),
};

export function roleCan(role: WorkspaceRole | null, action: WorkspaceAction): boolean {
  return role !== null && ROLE_ACTIONS[role].has(action);
}
