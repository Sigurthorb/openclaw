import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { __testing, parseEbaySearchListings } from "./ebay-search-parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  join(here, "__fixtures__", "search-mac-studio.html"),
  "utf8",
);

describe("parseEbaySearchListings", () => {
  it("extracts listings from a real ebay /sch page", () => {
    const listings = parseEbaySearchListings(fixture, 25);
    expect(listings.length).toBeGreaterThan(20);
    for (const l of listings) {
      expect(l.url).toMatch(/^https:\/\/www\.ebay\.com\/itm\/\d+$/);
      expect(l.itemId).toMatch(/^\d+$/);
      expect(l.title).toBeTruthy();
      expect(l.title).not.toBe("Shop on eBay");
      expect(l.title).not.toBe("New Listing");
      expect(l.priceText).toMatch(/\$/);
      expect(typeof l.priceUsd).toBe("number");
    }
  });

  it("filters the 'Shop on eBay' placeholder card", () => {
    const listings = parseEbaySearchListings(fixture, 50);
    expect(listings.some((l) => l.url.includes("/itm/123456"))).toBe(false);
    expect(listings.some((l) => l.title === "Shop on eBay")).toBe(false);
  });

  it("strips the 'New Listing' badge from the title", () => {
    const listings = parseEbaySearchListings(fixture, 50);
    const newListings = listings.filter((l) => l.isNewListing);
    expect(newListings.length).toBeGreaterThan(0);
    for (const l of newListings) {
      expect(l.title).not.toBe("New Listing");
      expect(l.title.length).toBeGreaterThan(5);
    }
  });

  it("respects the maxResults cap", () => {
    expect(parseEbaySearchListings(fixture, 5)).toHaveLength(5);
    expect(parseEbaySearchListings(fixture, 1)).toHaveLength(1);
  });

  it("returns an empty array for non-eBay HTML", () => {
    expect(parseEbaySearchListings("<html><body>hello</body></html>", 20)).toEqual([]);
  });
});

describe("price parsing", () => {
  it("parses common eBay price formats", () => {
    expect(__testing.parsePriceUsd("$1,234.56")).toBe(1234.56);
    expect(__testing.parsePriceUsd("US $59.00")).toBe(59);
    expect(__testing.parsePriceUsd("$10.00 to $20.00")).toBe(10);
    expect(__testing.parsePriceUsd("Free")).toBeNull();
  });
});
