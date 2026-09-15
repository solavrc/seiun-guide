const STATUS_LABELS = Object.freeze({
  active: "有効",
  conditional: "条件付き",
  effectless: "効果なし",
  unavailable: "付与不可",
  unknown: "未確認",
});

const PRIORITY_STAMP_IDS = ["600160", "600180", "600190", "600310"];
const STATUS_MARKS = Object.freeze({
  active: "✓",
  conditional: "~",
  effectless: "−",
  unavailable: "×",
  unknown: "?",
});

const state = {
  cards: [],
  stamps: [],
  query: "",
  category: "all",
  rarity: "all",
  variant: "all",
  status: "all",
};

const elements = {
  grid: document.querySelector("#card-grid"),
  empty: document.querySelector("#empty-state"),
  loadError: document.querySelector("#load-error"),
  search: document.querySelector("#search-input"),
  clearSearch: document.querySelector("#clear-search"),
  reset: document.querySelector("#reset-button"),
  emptyReset: document.querySelector("#empty-reset"),
  category: document.querySelector("#category-filter"),
  rarity: document.querySelector("#rarity-filter"),
  variant: document.querySelector("#variant-filter"),
  status: document.querySelector("#status-filter"),
  count: document.querySelector("#result-count"),
};

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function safeStatus(value) {
  return Object.hasOwn(STATUS_LABELS, value) ? value : "unknown";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function stampFor(id) {
  return state.stamps.find((stamp) => String(stamp.id) === String(id));
}

function variantStampState(variant, stampId) {
  return safeStatus(variant?.stampStates?.[String(stampId)]);
}

function groupStampState(card, stampId) {
  const states = card.variants.map((variant) => variantStampState(variant, stampId));
  if (!states.length || states.every((value) => value === "unknown")) return "unknown";
  return states.every((value) => value === states[0]) ? states[0] : "mixed";
}

function groupStampDetails(card, stampId) {
  const states = card.variants.map((variant) => variantStampState(variant, stampId));
  return { status: groupStampState(card, stampId), states };
}

function statusChip(status, compact = false) {
  const normalized = safeStatus(status);
  const chip = element("span", `status-chip status-${normalized}`);
  const mark = element("b", "", STATUS_MARKS[normalized]);
  mark.setAttribute("aria-hidden", "true");
  chip.append(mark, document.createTextNode(compact ? STATUS_MARKS[normalized] : ` ${STATUS_LABELS[normalized]}`));
  if (compact) chip.setAttribute("aria-label", STATUS_LABELS[normalized]);
  return chip;
}

function stampBadge(stamp, status, { compact = false } = {}) {
  const mixed = status === "mixed";
  const normalized = mixed ? "mixed" : safeStatus(status);
  const label = `${stamp?.name ?? `印 ${stamp?.id ?? ""}`}: ${mixed ? "版で異なる" : STATUS_LABELS[normalized]}`;
  const badge = element("span", `stamp-badge status-${normalized}`);
  badge.setAttribute("role", "img");
  badge.tabIndex = 0;
  badge.setAttribute("aria-label", label);
  badge.setAttribute("title", label);
  if (stamp?.image) {
    const image = document.createElement("img");
    image.src = stamp.image;
    image.alt = "";
    image.loading = "lazy";
    badge.append(image);
  }
  const mark = element("span", `stamp-mark status-mark-${normalized}`, mixed ? "↕" : STATUS_MARKS[normalized]);
  mark.setAttribute("aria-hidden", "true");
  badge.append(mark);
  if (!compact) {
    const hidden = element("span", "sr-only", label);
    badge.append(hidden);
  }
  return badge;
}

function stampRow(card, { compact = false } = {}) {
  const rail = element("div", compact ? "stamp-rail" : "variant-stamps");
  if (!compact) rail.append(element("span", "variant-stamps-label", "印状態"));
  for (const stampId of PRIORITY_STAMP_IDS) {
    const stamp = stampFor(stampId);
    if (!stamp) continue;
    const details = groupStampDetails(card, stampId);
    const badge = stampBadge(stamp, details.status, { compact });
    if (details.status === "mixed") {
      const variants = card.variants.map((variant) => `${variant.variant === "＋" ? "＋" : "通常"}:${STATUS_LABELS[variantStampState(variant, stampId)]}`).join(" / ");
      const label = `${stamp.name}: 版で異なる（${variants}）`;
      badge.setAttribute("aria-label", label);
      badge.title = label;
    }
    rail.append(badge);
  }
  return rail;
}

function variantStampRow(card, variant) {
  const row = element("div", "variant-stamps");
  row.append(element("span", "variant-stamps-label", "印状態"));
  for (const stampId of PRIORITY_STAMP_IDS) {
    const stamp = stampFor(stampId);
    if (!stamp) continue;
    row.append(stampBadge(stamp, variantStampState(variant, stampId), { compact: true }));
  }
  return row;
}

function allStampPanel(card) {
  const details = document.createElement("details");
  details.className = "all-stamps";
  const summary = document.createElement("summary");
  summary.textContent = "すべての印の状態を表示";
  details.append(summary);
  const grid = element("div", "all-stamp-grid");
  for (const stamp of state.stamps) {
    const item = element("div", "all-stamp-item");
    const details = groupStampDetails(card, stamp.id);
    const badge = stampBadge(stamp, details.status, { compact: true });
    if (details.status === "mixed") {
      const variants = card.variants.map((variant) => `${variant.variant === "＋" ? "＋" : "通常"}:${STATUS_LABELS[variantStampState(variant, stamp.id)]}`).join(" / ");
      const label = `${stamp.name}: 版で異なる（${variants}）`;
      badge.setAttribute("aria-label", label);
      badge.title = label;
    }
    item.append(badge);
    item.append(element("span", "", stamp.name.replace(/の印$/, "")));
    grid.append(item);
  }
  details.append(grid);
  return details;
}

function visibleVariants(card) {
  if (state.variant === "all" || card.category !== "お守り") return card.variants;
  return card.variants.filter((variant) => variant.variant === state.variant);
}

function cardIndex(card) {
  return normalize([
    card.name,
    card.category,
    card.rarity,
    ...card.variants.flatMap((variant) => [
      variant.id,
      variant.name,
      variant.variant,
      variant.text,
      ...(variant.dynamicMarkers ?? []),
      ...(variant.notes ?? []).map((note) => note.text),
    ]),
    ...(card.notes ?? []).map((note) => note.text),
  ].join(" "));
}

function cardStatuses(card) {
  const statuses = new Set();
  const variants = card.category === "お守り" ? visibleVariants(card) : card.variants;
  for (const variant of variants) {
    for (const value of Object.values(variant.stampStates ?? {})) statuses.add(safeStatus(value));
  }
  // Compatibility states are the source for amulet filtering.  A stamp/rune
  // entry has no compatibility map, so its public note statuses remain
  // useful as the fallback for the status filter.
  if (!statuses.size) for (const note of card.notes ?? []) statuses.add(safeStatus(note.status));
  if (!statuses.size) statuses.add("unknown");
  return statuses;
}

function matches(card) {
  if (state.category !== "all" && card.category !== state.category) return false;
  if (state.rarity !== "all" && card.rarity !== state.rarity) return false;
  if (!visibleVariants(card).length) return false;
  if (state.status !== "all" && !cardStatuses(card).has(state.status)) return false;
  const words = normalize(state.query).trim().split(/\s+/).filter(Boolean);
  return words.every((word) => cardIndex(card).includes(word));
}

function renderVariant(card, variant) {
  const section = element("section", "variant-block");
  const heading = element("div", "variant-heading");
  const pillLabel = card.category === "お守り" ? (variant.variant === "＋" ? "強化 ＋" : "通常") : (card.category === "印" ? "印" : "ルーン石");
  heading.append(element("span", `variant-pill${variant.variant === "＋" ? " plus" : ""}`, pillLabel));
  if (variant.name !== card.name) heading.append(element("span", "variant-name", variant.name));
  heading.append(element("span", "variant-id", `ID ${variant.id}`));
  section.append(heading);
  section.append(element("p", "card-text", variant.text || "（本文なし）"));
  if (variant.dynamicMarkers?.length) {
    const markers = element("div", "dynamic-markers");
    markers.append(element("span", "dynamic-label", "表示変数"));
    for (const marker of variant.dynamicMarkers) markers.append(element("code", "marker", marker));
    section.append(markers);
  }
  if (card.category === "お守り") section.append(variantStampRow(card, variant));
  return section;
}

function noteVariantLabels(card, note) {
  if (card.variants.length < 2) return [];
  const matching = card.variants.filter((variant) => (variant.notes ?? []).some((candidate) => candidate.status === note.status && candidate.text === note.text));
  if (!matching.length || matching.length === card.variants.length) return [];
  return matching.map((variant) => variant.variant === "＋" ? "＋" : variant.variant === "通常" ? "通常" : variant.variant);
}

function renderCard(card) {
  const firstId = card.variants[0]?.id ?? card.id;
  const article = element("article", "catalogue-card");
  article.id = `card-${firstId}`;
  article.dataset.cardIds = card.variants.map((variant) => variant.id).join(",");
  const top = element("header", "card-top");
  const figure = element("figure", "card-art");
  const image = document.createElement("img");
  image.src = card.image;
  image.alt = `${card.name}の画像`;
  image.loading = "lazy";
  image.addEventListener("error", () => figure.classList.add("is-missing"), { once: true });
  figure.append(image);
  top.append(figure);

  const head = element("div", "card-head");
  const meta = element("div", "card-meta");
  meta.append(element("span", "category-label", card.category));
  meta.append(element("span", "meta-dot", "·"));
  meta.append(element("span", "", card.rarity));
  head.append(meta);
  head.append(element("h3", "", card.name));
  head.append(element("span", "card-id", `ID ${firstId}${card.variants.length > 1 ? ` · ${card.variants.length}版` : ""}`));
  top.append(head);
  if (card.category === "お守り") top.append(stampRow(card, { compact: true }));
  const link = document.createElement("a");
  link.className = "card-link";
  link.href = `#card-${firstId}`;
  link.title = "このカードへのリンク";
  link.setAttribute("aria-label", `${card.name}へのリンク`);
  link.textContent = "↗";
  top.append(link);
  article.append(top);

  const body = element("div", "card-body");
  for (const variant of visibleVariants(card)) body.append(renderVariant(card, variant));
  article.append(body);

  const notes = document.createElement("details");
  notes.className = "card-notes";
  const summary = document.createElement("summary");
  summary.textContent = `▱  備考${card.notes?.length ? `（${card.notes.length}件）` : ""}`;
  notes.append(summary);
  const noteContent = element("div", "note-content");
  if (card.notes?.length) {
    const list = element("ul", "note-list");
    for (const note of card.notes) {
      const item = element("li", "note-item");
      for (const label of noteVariantLabels(card, note)) item.append(element("span", "note-variant", `${label}版`));
      item.append(statusChip(note.status), document.createTextNode(note.text));
      list.append(item);
    }
    noteContent.append(list);
  } else {
    const empty = element("p", "empty-note");
    empty.append(statusChip("unknown"), document.createTextNode("公開注記は未確認です。"));
    noteContent.append(empty);
  }
  if (state.stamps.length && card.category === "お守り") noteContent.append(allStampPanel(card));
  notes.append(noteContent);
  article.append(notes);

  const source = card.variants[0]?.publicSourceURL;
  if (source) {
    const footer = element("footer", "public-source");
    const anchor = document.createElement("a");
    anchor.href = source;
    anchor.target = "_blank";
    anchor.rel = "noreferrer noopener";
    anchor.textContent = "本文の公開出典 ↗";
    footer.append(anchor);
    article.append(footer);
  }
  return article;
}

function render() {
  const filtered = state.cards.filter(matches);
  const visibleCount = filtered.reduce((total, card) => total + visibleVariants(card).length, 0);
  elements.grid.replaceChildren(...filtered.map(renderCard));
  elements.empty.hidden = filtered.length !== 0;
  elements.count.replaceChildren();
  const strong = element("strong", "", `${filtered.length}`);
  elements.count.append(strong, document.createTextNode(` 図柄 · ${visibleCount} 本文`));
  elements.clearSearch.hidden = !state.query;
  focusHash();
}

function resetFilters() {
  state.query = "";
  state.category = "all";
  state.rarity = "all";
  state.variant = "all";
  state.status = "all";
  elements.search.value = "";
  elements.category.value = "all";
  elements.rarity.value = "all";
  elements.variant.value = "all";
  elements.status.value = "all";
  render();
}

function populateSelect(select, values) {
  const fragment = document.createDocumentFragment();
  const all = element("option", "", "すべて");
  all.value = "all";
  fragment.append(all);
  for (const value of values) {
    const option = element("option", "", value);
    option.value = value;
    fragment.append(option);
  }
  select.replaceChildren(fragment);
}

function focusHash() {
  const raw = decodeURIComponent(window.location.hash.slice(1));
  if (!raw) return;
  const target = document.getElementById(raw) ?? [...document.querySelectorAll(".catalogue-card")].find((card) => card.dataset.cardIds?.split(",").includes(raw.replace(/^card-/, "")));
  if (!target) return;
  document.querySelectorAll(".is-target").forEach((node) => node.classList.remove("is-target"));
  target.classList.add("is-target");
  window.setTimeout(() => target.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
}

function bindControls() {
  elements.search.addEventListener("input", (event) => { state.query = event.target.value; render(); });
  elements.clearSearch.addEventListener("click", () => { state.query = ""; elements.search.value = ""; render(); elements.search.focus(); });
  elements.reset.addEventListener("click", resetFilters);
  elements.emptyReset.addEventListener("click", resetFilters);
  elements.category.addEventListener("change", (event) => { state.category = event.target.value; render(); });
  elements.rarity.addEventListener("change", (event) => { state.rarity = event.target.value; render(); });
  elements.variant.addEventListener("change", (event) => { state.variant = event.target.value; render(); });
  elements.status.addEventListener("change", (event) => { state.status = event.target.value; render(); });
  window.addEventListener("hashchange", focusHash);
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "SELECT") {
      event.preventDefault();
      elements.search.focus();
    }
    if (event.key === "Escape" && document.activeElement === elements.search && state.query) {
      state.query = "";
      elements.search.value = "";
      render();
    }
  });
}

async function start() {
  try {
    const response = await fetch("./data/cards.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.cards = Array.isArray(payload.cards) ? payload.cards : [];
    state.stamps = state.cards
      .filter((card) => card.category === "印")
      .map((card) => ({ ...card.variants[0], image: card.image, id: card.variants[0]?.id ?? card.id, name: card.name }))
      .sort((a, b) => {
        const ai = PRIORITY_STAMP_IDS.indexOf(String(a.id));
        const bi = PRIORITY_STAMP_IDS.indexOf(String(b.id));
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || Number(a.id) - Number(b.id);
      });
    populateSelect(elements.category, [...new Set(state.cards.map((card) => card.category))]);
    populateSelect(elements.rarity, [...new Set(state.cards.map((card) => card.rarity))]);
    bindControls();
    render();
  } catch (error) {
    console.error(error);
    elements.loadError.hidden = false;
  }
}

start();
