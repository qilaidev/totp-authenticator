type ClassValue = string | false | null | undefined;

/**
 * Minimal class joiner. This app never stacks two conflicting Tailwind
 * utilities on one element (conditional branches always carry the full pair),
 * so `clsx` + `tailwind-merge` — ~9 kB gzip of resolution logic — bought
 * nothing on a bundle this size.
 */
export function cn(...inputs: ClassValue[]): string {
  let out = "";
  for (const input of inputs) {
    if (!input) continue;
    out = out ? `${out} ${input}` : input;
  }
  return out;
}
