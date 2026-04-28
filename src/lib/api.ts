import LZString from 'lz-string';

const API_BASE = process.env.API_BASE || '/api';

export async function saveMap(data: any, parentId?: string, password?: string) {
  const compressed = LZString.compressToBase64(JSON.stringify(data));
  const res = await fetch(`${API_BASE}/maps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: compressed, parentId, password })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ id: string }>;
}

export async function getMapMeta(id: string) {
  const res = await fetch(`${API_BASE}/maps/${id}/meta`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ requiresPassword: boolean }>;
}

export async function loadMap(id: string, password?: string) {
  const res = await fetch(`${API_BASE}/maps/${id}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  let decompressed;
  // Fallback to UTF16 if Base64 fails (compatibility with old maps)
  try {
    decompressed = LZString.decompressFromBase64(json.data);
    if (!decompressed) decompressed = LZString.decompressFromUTF16(json.data);
  } catch (e) {
    decompressed = LZString.decompressFromUTF16(json.data);
  }
  return { data: JSON.parse(decompressed!), id: json.id };
}
