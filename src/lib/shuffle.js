/** Same order every time for the same student + window, so a reload doesn't reshuffle. */
export function seededShuffle(arr, seedText) {
  const a = arr.slice();
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return (h % 100000) / 100000; };
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(rnd() * (j + 1));
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
}

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'window';
}
