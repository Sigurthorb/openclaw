export type EbayListing = {
  itemId: string;
  title: string;
  priceText: string;
  priceUsd: number | null;
  condition: string | null;
  shipping: string | null;
  url: string;
  isNewListing: boolean;
};

const PLACEHOLDER_URL_PATTERN = /\/itm\/12345\d?\b/;
const PLACEHOLDER_TITLE = "Shop on eBay";

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function parsePriceUsd(priceText: string): number | null {
  // Common forms: "$1,234.56", "$10.00 to $20.00", "US $123.45"
  const m = priceText.match(/\$([0-9][0-9,]*\.?[0-9]*)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function extractCardBlock(html: string, startIdx: number): { block: string; nextSearchFrom: number } {
  const end = html.indexOf("</li>", startIdx);
  if (end === -1) return { block: html.slice(startIdx), nextSearchFrom: html.length };
  return { block: html.slice(startIdx, end), nextSearchFrom: end + 5 };
}

function extractTitle(block: string): { title: string | null; isNewListing: boolean } {
  // Title lives inside <div ... class="s-card__title">...spans...</div>
  // A "New Listing" badge may precede the real title in a span with class="s-card__new-listing".
  const titleDiv = block.match(/class="s-card__title"[^>]*>([\s\S]*?)<\/div>/);
  if (!titleDiv) return { title: null, isNewListing: false };
  const inner = titleDiv[1];
  const isNewListing = /class="s-card__new-listing"/.test(inner);
  // Take the FIRST "primary default" styled span (eBay's actual title span).
  const primary = inner.match(
    /<span[^>]*class="su-styled-text primary default"[^>]*>([^<]+)<\/span>/,
  );
  if (primary) return { title: decodeHtml(primary[1]).trim(), isNewListing };
  // Fallback: any span text after stripping new-listing badge
  const cleaned = inner.replace(/<span[^>]*class="s-card__new-listing"[^>]*>[^<]*<\/span>/g, "");
  const anySpan = cleaned.match(/<span[^>]*>([^<]+)<\/span>/);
  if (anySpan) return { title: decodeHtml(anySpan[1]).trim(), isNewListing };
  return { title: null, isNewListing };
}

export function parseEbaySearchListings(html: string, maxResults: number): EbayListing[] {
  const out: EbayListing[] = [];
  const seen = new Set<string>();
  const cardRe = /<li class="s-card s-card--horizontal"[^>]*data-listingid="([^"]+)"[^>]*>/g;

  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) {
    if (out.length >= maxResults) break;
    const listingId = m[1];
    if (seen.has(listingId)) continue;
    const { block } = extractCardBlock(html, m.index);

    const linkMatch = block.match(/<a class="s-card__link"[^>]*href="([^"]+)"/);
    if (!linkMatch) continue;
    const url = stripQuery(decodeHtml(linkMatch[1]));
    if (PLACEHOLDER_URL_PATTERN.test(url)) continue;

    const itemIdMatch = url.match(/\/itm\/(\d+)/);
    const itemId = itemIdMatch ? itemIdMatch[1] : listingId;

    const { title, isNewListing } = extractTitle(block);
    if (!title || title === PLACEHOLDER_TITLE) continue;

    const priceMatch = block.match(/s-card__price[^"]*"[^>]*>([^<]+)</);
    const priceText = priceMatch ? decodeHtml(priceMatch[1]).trim() : "";
    const priceUsd = parsePriceUsd(priceText);

    const condMatch = block.match(/s-card__subtitle"[^>]*>\s*<span[^>]*>([^<]+)</);
    const condition = condMatch ? decodeHtml(condMatch[1]).trim() : null;

    const shipMatch = block.match(/s-card__shipping[^"]*"[^>]*>([^<]+)</);
    const shipping = shipMatch ? decodeHtml(shipMatch[1]).trim() : null;

    seen.add(listingId);
    out.push({
      itemId,
      title,
      priceText,
      priceUsd,
      condition,
      shipping,
      url,
      isNewListing,
    });
  }

  return out;
}

export const __testing = { parsePriceUsd, decodeHtml };
