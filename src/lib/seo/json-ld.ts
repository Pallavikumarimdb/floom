/**
 * Safe JSON-LD serializer.
 *
 * JSON.stringify does not escape the sequence `</script>`. When injecting a
 * stringified object into a <script type="application/ld+json"> tag via
 * dangerouslySetInnerHTML, a malicious app name such as:
 *
 *   </script><script>alert(1)</script>
 *
 * would break out of the script element and inject arbitrary HTML.
 *
 * This helper serializes the data and then escapes the `</` sequence so it can
 * never close the enclosing <script> element. The resulting string is valid
 * JSON-LD — parsers treat `<\/` and `</` identically.
 *
 * Reference: https://html.spec.whatwg.org/#restrictions-for-contents-of-script-elements
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/<\//g, "<\\/");
}
