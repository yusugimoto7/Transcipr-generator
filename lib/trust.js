// Sources a licensed firm's content cannot rest on: state propaganda and
// content farms that rewrite IRCC pages as "news". Matched against both the
// outlet name and the link, since web-search items often carry only the name.
// Shared by the server filter and the page, which drops such cards from a
// deck saved on the device before a source was blocked.
export const UNTRUSTED =
  /(legit\.ng|yen\.com\.gh|tuko\.(co\.ke|news)|tuko news|pravda|sputnik|\brt\.com\b|russia today|\btass\b|kalkine|y-axis|ssbcrack|newstrack|opindia|global times)/i;

export function isUntrusted(item) {
  return UNTRUSTED.test(`${item.source_name || ""} ${item.resolved_url || ""} ${item.source_url || ""}`);
}
