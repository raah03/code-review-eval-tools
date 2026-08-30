import { readFileSync } from "node:fs";
import Mustache from "mustache";

// templates render to markdown, not html, so escaping would corrupt them
Mustache.escape = (text: string): string => text;

export function renderTemplate(template: string, view: Record<string, unknown>): string {
  return Mustache.render(template, view);
}

export function loadTemplate(path: string): string {
  return readFileSync(path, "utf8");
}
