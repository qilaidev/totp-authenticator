export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

/**
 * Storage shape stays backwards/forwards compatible with the standard
 * `authList` format: `localStorage.authList = [{ remark, secret }]`.
 *
 * Every other field is optional. `id` is generated locally the first time an
 * entry is seen and only exists so React keys and delete targets survive
 * reordering and duplicate remarks — the original app keys off the array index,
 * which deletes the wrong row whenever two entries share a remark.
 */
export interface AuthEntry {
  id: string;
  remark: string;
  secret: string;
  issuer?: string;
  period?: number;
  digits?: number;
  algorithm?: TotpAlgorithm;
}

/** An entry before it has been committed to storage (no id yet). */
export type DraftEntry = Omit<AuthEntry, "id">;

export type SaveResult = "added" | "updated";

export interface ImportSummary {
  added: number;
  skipped: number;
  persisted: "ok" | "quota";
}
