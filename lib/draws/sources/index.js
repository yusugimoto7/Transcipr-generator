// Source registry. Each source is isolated: one broken parser or unreachable
// government page never takes down the whole run (spec principle §11.1).
import * as expressEntry from "./expressEntry";
import * as bcpnp from "./bcpnp";
import * as oinp from "./oinp";
import * as alberta from "./alberta";
import * as oinpEntrepreneur from "./oinpEntrepreneur";

export const SOURCES = [
  expressEntry,
  bcpnp,
  oinp,
  alberta,
  oinpEntrepreneur,
];

// Returns { items, errors } — never throws.
export async function collectAll({ only } = {}) {
  const active = only?.length
    ? SOURCES.filter((s) => only.includes(s.id))
    : SOURCES;

  const settled = await Promise.all(
    active.map(async (source) => {
      try {
        const items = (await source.collect()) || [];
        return { id: source.id, items, error: null };
      } catch (err) {
        return { id: source.id, items: [], error: String(err?.message || err) };
      }
    })
  );

  const items = [];
  const errors = [];
  for (const r of settled) {
    items.push(...r.items);
    if (r.error) errors.push({ source: r.id, error: r.error });
  }
  return { items, errors };
}
