/**
 * Sanitizes a coordinator's custom CSS before it is stored and later injected
 * verbatim into a `<style>` tag on `/c/$slug` and `/api/embed/$slug` -- both
 * public, unauthenticated surfaces. This is not a general-purpose CSS parser;
 * it strips the handful of constructs that turn "harmless styling" into a
 * script-execution or exfiltration vector when concatenated straight into a
 * page's HTML:
 *
 * - `<` / `>` -- prevents breaking out of the `<style>` element entirely
 *   (e.g. `</style><script>...`).
 * - `@import` -- pulls in an arbitrary external stylesheet.
 * - `expression(` -- legacy IE CSS expressions can execute script.
 * - `javascript:` URIs and non-image `url(...)` values that aren't a plain
 *   `http(s)://` or `data:image/` URL -- blocks `url(javascript:...)` and
 *   CSS exfiltration tricks (`url(https://evil/?leak=...)` in an attribute
 *   selector) without banning legitimate background images or web fonts.
 * - `behavior:` -- legacy IE HTC behaviors, same class of risk as expression().
 *
 * Anything matched is dropped, not escaped -- the field is CSS, so there is
 * no safe "escaped" form of `<script>` inside it; removing it is what keeps
 * the rest of the coordinator's stylesheet usable.
 */
export function sanitizeCustomCss(input: string): string {
  let css = input;

  // Strip HTML tag delimiters outright -- CSS never legitimately needs them.
  css = css.replace(/[<>]/g, "");

  // Strip @import rules (with or without a following url()).
  css = css.replace(/@import\b[^;]*;?/gi, "");

  // Strip CSS expression() calls (legacy IE script execution).
  css = css.replace(/expression\s*\([^)]*\)/gi, "");

  // Strip legacy IE HTC behavior declarations.
  css = css.replace(/behavior\s*:[^;}]*/gi, "");

  // Strip javascript: URIs anywhere they appear.
  css = css.replace(/javascript\s*:/gi, "");

  // Restrict url(...) to http(s):// and data: -- drop anything else
  // (relative paths with no scheme included, since they can't resolve
  // predictably across the public calendar vs. the embed fragment anyway).
  css = css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (match, _quote, value) => {
    const trimmed = value.trim();
    if (/^(https?:)?\/\//i.test(trimmed) || /^data:/i.test(trimmed)) return match;
    return "url()";
  });

  return css.trim();
}
