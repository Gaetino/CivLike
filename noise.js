// -----------------------------------------------------------------------------
// Seed & bruit de Perlin 2D
// -----------------------------------------------------------------------------

const DEFAULT_SEED = 123456789;

// Seed depuis l'URL : ?seed=1234 ou ?seed=ma_carte
function getSeedFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("seed");
    if (!s) return DEFAULT_SEED;

    const n = Number(s);
    if (Number.isFinite(n)) return n | 0;

    // Hash très simple de chaîne → entier 32 bits
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = (hash * 31 + s.charCodeAt(i)) | 0;
    }
    return hash;
  } catch (e) {
    return DEFAULT_SEED;
  }
}

// Petit PRNG déterministe (mulberry32)
function createRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bruit de Perlin 2D
function createPerlin2D(seed) {
  const rng = createRng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  // Shuffle de la permutation
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }

  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const gradients = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
  ];

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + t * (b - a);
  }

  function grad(hash, x, y) {
    const g = gradients[hash & 7];
    return g[0] * x + g[1] * y;
  }

  return function (x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[xi + perm[yi]];
    const ab = perm[xi + perm[yi + 1]];
    const ba = perm[xi + 1 + perm[yi]];
    const bb = perm[xi + 1 + perm[yi + 1]];

    const x1 = lerp(grad(aa, xf, yf),     grad(ba, xf - 1, yf),     u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);

    // On ramène dans [0,1] et on clamp un peu
    let value = (lerp(x1, x2, v) * 0.5) + 0.5;
    if (value < 0) value = 0;
    if (value > 1) value = 1;
    return value;
  };
}