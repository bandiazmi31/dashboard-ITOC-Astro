interface UserLike {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * Name to show for the logged-in user in the header.
 * Uses the first non-empty profile field (username, full_name, name), then the part of the email before "@".
 * Returns null when there is no user, so the header shows nothing.
 */
export function getDisplayName(user: UserLike | null | undefined): string | null {
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  for (const key of ['username', 'full_name', 'name']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }

  const localPart = user.email?.split('@')[0]?.trim();
  return localPart ? localPart : null;
}
