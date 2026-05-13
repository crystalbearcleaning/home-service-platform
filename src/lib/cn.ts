// Tiny className concatenator. Filters falsy values and joins with a
// space. Kept dependency-free on purpose — clsx / tailwind-merge can be
// added later if a real need arises.
export function cn(
  ...parts: Array<string | number | false | null | undefined>
): string {
  return parts
    .filter((p): p is string | number => Boolean(p))
    .map(String)
    .join(" ");
}
