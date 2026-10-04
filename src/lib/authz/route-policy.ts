const PUBLIC_EXACT_PATHS = new Set(["/", "/sign-in", "/auth/callback"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT_PATHS.has(pathname);
}
