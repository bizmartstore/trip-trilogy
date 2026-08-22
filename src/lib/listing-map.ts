/** Town-centre pins used until an admin sets a custom map location. */
const DESTINATION_COORDS: Record<string, { lat: number; lng: number }> = {
  "el nido": { lat: 11.1949, lng: 119.4013 },
  coron: { lat: 11.9986, lng: 120.2043 },
  "puerto princesa": { lat: 10.1927, lng: 118.9256 },
  "port barton": { lat: 10.4432, lng: 119.2 },
  "san vicente": { lat: 10.5231, lng: 119.2402 },
  balabac: { lat: 7.9896, lng: 117.0642 },
  palawan: { lat: 11.031, lng: 119.4 },
};

export const DEFAULT_MAP_COORDS = DESTINATION_COORDS.palawan;

export type MapCoords = { lat: number; lng: number };

export function isValidCoords(coords: { lat?: number; lng?: number } | null | undefined): coords is MapCoords {
  if (!coords) return false;
  const { lat, lng } = coords;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function coordsForDestination(
  destination: string,
  catalog?: Array<{ name?: string; coords?: MapCoords | null }>,
): MapCoords {
  const key = destination.trim().toLowerCase();
  const match = catalog?.find((d) => (d.name ?? "").trim().toLowerCase() === key);
  return sanitizeCoords(match?.coords) ?? DESTINATION_COORDS[key] ?? DEFAULT_MAP_COORDS;
}

export function sameCoords(a?: MapCoords | null, b?: MapCoords | null) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 0.0002 && Math.abs(a.lng - b.lng) < 0.0002;
}

export function isDestinationDefaultPin(
  coords?: MapCoords | null,
  destination?: string,
  catalog?: Array<{ name?: string; coords?: MapCoords | null }>,
) {
  if (!isValidCoords(coords)) return false;
  if (destination) return sameCoords(coords, coordsForDestination(destination, catalog));
  const extras = (catalog ?? []).map((d) => d.coords).filter(isValidCoords);
  return [...Object.values(DESTINATION_COORDS), ...extras].some((pin) => sameCoords(coords, pin));
}

export function parseMapLocation(raw: string): MapCoords | null {
  const text = raw.trim();
  if (!text) return null;

  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return sanitizeCoords({ lat: Number(at[1]), lng: Number(at[2]) });

  const bang = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bang) return sanitizeCoords({ lat: Number(bang[1]), lng: Number(bang[2]) });

  const osmHash = text.match(/#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/);
  if (osmHash) return sanitizeCoords({ lat: Number(osmHash[1]), lng: Number(osmHash[2]) });

  const mlat = text.match(/[?&]mlat=(-?\d+(?:\.\d+)?)/i);
  const mlon = text.match(/[?&]mlon=(-?\d+(?:\.\d+)?)/i);
  if (mlat && mlon) return sanitizeCoords({ lat: Number(mlat[1]), lng: Number(mlon[1]) });

  const query = text.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (query) return sanitizeCoords({ lat: Number(query[1]), lng: Number(query[2]) });

  const pair = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (pair) return sanitizeCoords({ lat: Number(pair[1]), lng: Number(pair[2]) });

  return null;
}

export function sanitizeCoords(coords: { lat: number; lng: number } | null | undefined): MapCoords | null {
  if (!isValidCoords(coords)) return null;
  return {
    lat: Number(coords.lat.toFixed(6)),
    lng: Number(coords.lng.toFixed(6)),
  };
}

export function resolveListingCoords(listing: { coords?: MapCoords | null; destination?: string }): MapCoords | null {
  return sanitizeCoords(listing.coords) ?? (listing.destination ? coordsForDestination(listing.destination) : null);
}

export function osmEmbedUrl(coords: MapCoords) {
  const { lat, lng } = coords;
  const bbox = `${lng - 0.08},${lat - 0.06},${lng + 0.08},${lat + 0.06}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

export function listingShowsMap(listing: {
  showMap?: boolean;
  mapHidden?: boolean;
  coords?: MapCoords | null;
  destination?: string;
}) {
  if (listing.mapHidden === true || listing.showMap === false) return false;
  return !!resolveListingCoords(listing);
}

export function applyListingMapFlags<T extends { showMap?: boolean; mapHidden?: boolean }>(listing: T): T {
  const hidden = listing.mapHidden === true || listing.showMap === false;
  listing.showMap = !hidden;
  listing.mapHidden = hidden;
  return listing;
}
