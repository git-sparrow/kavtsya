/**
 * The single leading letter an `Avatar` shows, uppercased — «Олена» → «О»,
 * «bogdan» → «B». Leading whitespace is skipped; a blank name yields an empty
 * string (the avatar then renders its plain circle, and the visible name text
 * carries identity for assistive tech either way).
 */
export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
