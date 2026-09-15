const STATUS_LABELS = Object.freeze({
  active: "適用",
  conditional: "一部適用",
});

const RAIL_STAMP_IDS = ["600190", "600310"];
const EFFECTIVE_STAMP_STATES = new Set(["active", "conditional"]);
const STATUS_MARKS = Object.freeze({
  active: "✓",
  conditional: "~",
});
const NOTE_KIND_LABELS = Object.freeze({
  correction: "訂正",
  interaction: "相互作用",
  exception: "例外",
});

const state = {
  cards: [],
  stamps: [],
  query: "",
  category: "all",
  rarity: "all",
  variant: "all",
  stampFilter: "all",
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
  stampFilter: document.querySelector("#stamp-filter"),
  count: document.querySelector("#result-count"),
};

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function safeStatus(value) {
  return Object.hasOwn(STATUS_LABELS, value) ? value : null;
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

function groupStampState(card, stampId) {
  return safeStatus(card.stampStates?.[String(stampId)]);
}

function groupStampDetails(card, stampId) {
  const key = String(stampId);
  return {
    status: groupStampState(card, stampId),
    reason: typeof card.stampReasons?.[key] === "string" ? card.stampReasons[key].trim() : "",
  };
}

function noteKindChip(kind) {
  if (!Object.hasOwn(NOTE_KIND_LABELS, kind)) return null;
  return element("span", `note-kind note-kind-${kind}`, NOTE_KIND_LABELS[kind]);
}

function stampBadge(stamp, status, { compact = false, reason = "" } = {}) {
  const normalized = safeStatus(status);
  if (!stamp || !normalized) return null;
  const baseLabel = `${stamp.name ?? `印 ${stamp.id ?? ""}`}: ${STATUS_LABELS[normalized]}`;
  const label = reason ? `${baseLabel}。${reason}` : baseLabel;
  const badge = document.createElement("a");
  badge.className = `stamp-badge status-${normalized}`;
  badge.href = `#card-${stamp.id}`;
  badge.setAttribute("aria-label", label);
  badge.setAttribute("title", label);
  if (stamp?.image) {
    const image = document.createElement("img");
    image.src = stamp.image;
    image.alt = "";
    image.loading = "lazy";
    badge.append(image);
  }
  const mark = element("span", `stamp-mark status-mark-${normalized}`, STATUS_MARKS[normalized]);
  mark.setAttribute("aria-hidden", "true");
  badge.append(mark);
  if (!compact) {
    const hidden = element("span", "sr-only", label);
    badge.append(hidden);
  }
  return badge;
}

function stampReferenceLink(stamp) {
  if (!stamp) return null;
  const name = stamp.name ?? `印 ${stamp.id ?? ""}`;
  const label = `関連印：${name}のページ`;
  const link = document.createElement("a");
  link.className = "stamp-reference-link";
  link.href = `#card-${stamp.id}`;
  link.setAttribute("aria-label", label);
  link.setAttribute("title", label);
  if (stamp.image) {
    const image = document.createElement("img");
    image.src = stamp.image;
    image.alt = "";
    image.loading = "lazy";
    link.append(image);
  }
  link.append(element("span", "stamp-reference-name", name.replace(/の印$/, "")));
  return link;
}

function stampRow(card) {
  const rail = element("div", "stamp-rail");
  for (const stampId of RAIL_STAMP_IDS) {
    const stamp = stampFor(stampId);
    if (!stamp) continue;
    const details = groupStampDetails(card, stampId);
    if (!EFFECTIVE_STAMP_STATES.has(details.status)) continue;
    const badge = stampBadge(stamp, details.status, { compact: true, reason: details.reason });
    if (badge) rail.append(badge);
  }
  return rail.children.length ? rail : null;
}

function safeQuoteSourceURL(value) {
  return typeof value === "string" && value.startsWith("https://raw.githubusercontent.com/Avenshy/MajsoulData/") && !/[?#]/.test(value) ? value : "";
}

function renderQuote(quote) {
  const text = typeof quote?.text === "string" ? quote.text.trim() : "";
  const label = typeof quote?.label === "string" ? quote.label.trim() : "";
  const sourceURL = safeQuoteSourceURL(quote?.sourceURL);
  if (!text || !label || !sourceURL) return null;
  const block = element("blockquote", "note-quote");
  block.append(element("p", "note-quote-text", text));
  const cite = element("cite", "note-quote-cite");
  const source = document.createElement("a");
  source.href = sourceURL;
  source.target = "_blank";
  source.rel = "noreferrer noopener";
  source.textContent = label;
  cite.append(source);
  block.append(cite);
  return block;
}

function visibleVariants(card) {
  if (state.variant === "all" || card.category !== "お守り") return card.variants;
  return card.variants.filter((variant) => variant.variant === state.variant);
}

function stampNames(ids) {
  if (!Array.isArray(ids)) return [];
  return ids.flatMap((id) => {
    const stamp = stampFor(id);
    return stamp ? [stamp.name] : [];
  });
}

function railSearchTerms(card) {
  return RAIL_STAMP_IDS.flatMap((stampId) => {
    const details = groupStampDetails(card, stampId);
    if (!EFFECTIVE_STAMP_STATES.has(details.status)) return [];
    const stamp = stampFor(stampId);
    return stamp ? [stamp.name, details.reason] : [details.reason];
  });
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
    ]),
    ...(card.notes ?? []).flatMap((note) => [
      note.title,
      note.text,
      ...stampNames(note.stampIds),
      ...(Array.isArray(note.quotes) ? note.quotes : []).flatMap((quote) => [quote.text, quote.label]),
    ]),
    ...(card.rules ?? []),
    ...railSearchTerms(card),
  ].join(" "));
}

function hasEffectiveStamp(card, stampId) {
  return EFFECTIVE_STAMP_STATES.has(safeStatus(card.stampStates?.[String(stampId)]));
}

function matches(card) {
  if (state.category !== "all" && card.category !== state.category) return false;
  if (state.rarity !== "all" && card.rarity !== state.rarity) return false;
  if (!visibleVariants(card).length) return false;
  if (state.stampFilter !== "all" && !hasEffectiveStamp(card, state.stampFilter)) return false;
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
  return section;
}

function renderRules(card) {
  if (card.category !== "印" || !Array.isArray(card.rules) || !card.rules.length) return null;
  const section = element("section", "stamp-rules");
  const heading = element("h4", "stamp-rules-heading", "共通ルール");
  heading.id = `rules-${card.id}`;
  section.setAttribute("aria-labelledby", heading.id);
  section.append(heading);
  const list = element("ul", "stamp-rules-list");
  for (const rule of card.rules) {
    if (typeof rule === "string" && rule.trim()) list.append(element("li", "", rule.trim()));
  }
  if (!list.children.length) return null;
  section.append(list);
  return section;
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
  if (card.category === "お守り") {
    const rail = stampRow(card);
    if (rail) top.append(rail);
  }
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

  const rules = renderRules(card);
  if (rules) article.append(rules);

  const notes = Array.isArray(card.notes) ? card.notes.filter((note) => note && typeof note.text === "string" && note.text.trim() && Object.hasOwn(NOTE_KIND_LABELS, note.kind)) : [];
  if (notes.length) {
    const noteSection = element("section", "card-notes");
    const heading = element("h4", "card-notes-heading", `▱  備考（${notes.length}件）`);
    heading.id = `notes-${firstId}`;
    noteSection.setAttribute("aria-labelledby", heading.id);
    noteSection.append(heading);
    const noteContent = element("div", "note-content");
    const list = element("ul", "note-list");
    for (const note of notes) {
      const item = element("li", "note-item");
      const title = typeof note.title === "string" ? note.title.trim() : "";
      const noteText = element("p", "note-text");
      const kind = title ? null : noteKindChip(note.kind);
      if (kind) noteText.append(kind);
      noteText.append(document.createTextNode(note.text.trim()));
      if (title) item.append(element("h5", "note-title", title));
      item.append(noteText);
      for (const quote of Array.isArray(note.quotes) ? note.quotes : []) {
        const block = renderQuote(quote);
        if (block) item.append(block);
      }
      const related = element("div", "note-stamp-links");
      const relatedStamps = new Set();
      for (const stampId of Array.isArray(note.stampIds) ? note.stampIds : []) {
        const key = String(stampId);
        if (relatedStamps.has(key)) continue;
        const stamp = stampFor(stampId);
        const link = stampReferenceLink(stamp);
        if (!link) continue;
        relatedStamps.add(key);
        related.append(link);
      }
      if (related.children.length) item.append(related);
      list.append(item);
    }
    noteContent.append(list);
    noteSection.append(noteContent);
    article.append(noteSection);
  }

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
}

function resetFilters() {
  state.query = "";
  state.category = "all";
  state.rarity = "all";
  state.variant = "all";
  state.stampFilter = "all";
  elements.search.value = "";
  elements.category.value = "all";
  elements.rarity.value = "all";
  elements.variant.value = "all";
  elements.stampFilter.value = "all";
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

function hasActiveFilters() {
  return Boolean(state.query || state.category !== "all" || state.rarity !== "all" || state.variant !== "all" || state.stampFilter !== "all");
}

function targetForHash(raw) {
  return document.getElementById(raw) ?? [...document.querySelectorAll(".catalogue-card")].find((card) => card.dataset.cardIds?.split(",").includes(raw.replace(/^card-/, "")));
}

function focusHash() {
  let raw = "";
  try {
    raw = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return;
  }
  if (!raw) return;
  const target = targetForHash(raw);
  if (!target && hasActiveFilters() && raw.startsWith("card-")) {
    resetFilters();
    return;
  }
  if (!target) return;
  document.querySelectorAll(".is-target").forEach((node) => node.classList.remove("is-target"));
  target.classList.add("is-target");
  window.setTimeout(() => target.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
}

function handleCardLink(event) {
  const link = event.target.closest?.("a[href^='#card-']");
  if (!link || !hasActiveFilters()) return;
  const href = link.getAttribute("href");
  if (!href) return;
  const raw = href.slice(1);
  if (targetForHash(raw)) return;
  event.preventDefault();
  resetFilters();
  if (window.location.hash === href) focusHash();
  else window.location.hash = raw;
}

function bindControls() {
  elements.search.addEventListener("input", (event) => { state.query = event.target.value; render(); });
  elements.clearSearch.addEventListener("click", () => { state.query = ""; elements.search.value = ""; render(); elements.search.focus(); });
  elements.reset.addEventListener("click", resetFilters);
  elements.emptyReset.addEventListener("click", resetFilters);
  elements.category.addEventListener("change", (event) => { state.category = event.target.value; render(); });
  elements.rarity.addEventListener("change", (event) => { state.rarity = event.target.value; render(); });
  elements.variant.addEventListener("change", (event) => { state.variant = event.target.value; render(); });
  elements.stampFilter.addEventListener("change", (event) => { state.stampFilter = event.target.value; render(); });
  window.addEventListener("hashchange", focusHash);
  document.addEventListener("click", handleCardLink);
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
        const ai = RAIL_STAMP_IDS.indexOf(String(a.id));
        const bi = RAIL_STAMP_IDS.indexOf(String(b.id));
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || Number(a.id) - Number(b.id);
      });
    populateSelect(elements.category, [...new Set(state.cards.map((card) => card.category))]);
    populateSelect(elements.rarity, [...new Set(state.cards.map((card) => card.rarity))]);
    bindControls();
    render();
    focusHash();
  } catch (error) {
    console.error(error);
    elements.loadError.hidden = false;
  }
}

start();
