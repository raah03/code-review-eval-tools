import { git, showFile } from "./git.js";

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  /** pre-rename path, only set when status is renamed */
  oldPath: string | null;
}

const STATUS_BY_PREFIX: Record<string, ChangedFile["status"]> = {
  A: "added",
  M: "modified",
  D: "deleted",
};

/** unfiltered, inject narrows to source-only files itself */
export function listChangedFiles(mirror: string, base: string, commit: string): ChangedFile[] {
  const raw = git(mirror, ["diff", "--name-status", "-M", base, commit]);
  return raw
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): ChangedFile => {
      const fields = line.split("\t");
      const statusField = fields[0] as string;
      if (statusField.startsWith("R")) {
        return { path: fields[2] as string, status: "renamed", oldPath: fields[1] as string };
      }
      return {
        path: fields[1] as string,
        status: STATUS_BY_PREFIX[statusField] ?? "modified",
        oldPath: null,
      };
    });
}

/** showFile throws on a missing path, that's expected here not an error */
export function readFileAtRef(mirror: string, ref: string, path: string): string | null {
  try {
    return showFile(mirror, ref, path);
  } catch {
    return null;
  }
}
