export type SuggestionStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "published"
  | "exported"
  | "failed"
  | "reverted";
export type Role = "Owner" | "Editor" | "Reviewer" | "Viewer";
const transitions: Partial<Record<SuggestionStatus, Partial<Record<SuggestionStatus, Role[]>>>> = {
  draft: { pending_review: ["Owner", "Editor"] },
  pending_review: { approved: ["Owner", "Reviewer"], rejected: ["Owner", "Reviewer"] },
  approved: { published: ["Owner"], exported: ["Owner", "Editor"] },
  failed: { pending_review: ["Owner", "Editor"] },
  rejected: { pending_review: ["Owner", "Editor"] },
  published: { reverted: ["Owner"] },
};
export function canTransition(from: SuggestionStatus, to: SuggestionStatus, role: Role): boolean {
  return transitions[from]?.[to]?.includes(role) ?? false;
}
export function transitionSuggestion(
  from: SuggestionStatus,
  to: SuggestionStatus,
  role: Role,
): SuggestionStatus {
  if (!canTransition(from, to, role))
    throw new Error(`Transition ${from} → ${to} is not allowed for ${role}`);
  return to;
}
