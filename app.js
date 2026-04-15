// === Constants ===
const RENDER_SCALE = 1.5; // Export at 1.5× for high-res output

const DIMENSIONS = [
  { name: '1160 × 400', width: 1160, height: 400, logoWidth: 400 },
  { name: '850 × 1020', width: 850, height: 1020, logoWidth: 672 },
  { name: '1200 × 630', width: 1200, height: 630, logoWidth: 672 },
  { name: '600 × 403', width: 600, height: 403, logoWidth: 377, cta: true },
];

// Logo layout: single combined SVG (672×184 native)
const LOGO_NATIVE_W = 672;
const LOGO_NATIVE_H = 184;
const LOGO = {
  gap: 12.732,              // gap between logo bottom and season text (at base scale)
  seasonFontSize: 16.66,    // season font size at base logoWidth ~400
  seasonTracking: 1.19,
};

// === State ===
const state = {
  seasonText: 'Winter 2026',
  bgImage: null,
  overlayColor: '#000000',
  overlayOpacity: 0.4,
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hueRotate: 0,
  selectedDimension: 0,
};

// Per-format background placement: scale (%), offsetX (%), offsetY (%)
const bgPlacement = DIMENSIONS.map(() => ({ scale: 100, offsetX: 0, offsetY: 0 }));

let logoSvgText = null;
const logoCache = new Map(); // cache rasterized logos by size key

// Unsplash state
let unsplashKey = localStorage.getItem('unsplash_key') || '';
let unsplashPage = 1;
let unsplashQuery = '';

// === Init ===
async function init() {
  // Load raw SVG text for on-demand rasterization at exact target size
  const res = await fetch('assets/logo.svg');
  logoSvgText = await res.text();

  // Explicitly load Baloo 2 (not used in DOM, so browser won't preload it)
  await document.fonts.load('500 16px "Baloo 2"');
  await document.fonts.ready;

  bindEvents();
  render();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Rasterize logo SVG at exact pixel dimensions (cached)
async function getLogoAtSize(pixelW, pixelH) {
  const key = `${pixelW}x${pixelH}`;
  if (logoCache.has(key)) return logoCache.get(key);

  let svgText = logoSvgText;
  svgText = svgText.replace(/width="[^"]*"/, `width="${pixelW}"`);
  svgText = svgText.replace(/height="[^"]*"/, `height="${pixelH}"`);
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);
  logoCache.set(key, img);
  return img;
}

// === Rendering ===
async function render() {
  const canvas = document.getElementById('preview');
  const dim = DIMENSIONS[state.selectedDimension];
  // Preview uses devicePixelRatio for crisp display on Retina screens
  const dpr = window.devicePixelRatio || 1;
  await renderToCanvas(canvas, dim, state.selectedDimension, { scale: dpr });
}

async function renderToCanvas(canvas, dim, dimIndex, opts = {}) {
  const s = opts.scale || RENDER_SCALE;
  const ctx = canvas.getContext('2d');
  canvas.width = dim.width * s;
  canvas.height = dim.height * s;

  // Scale all drawing operations
  ctx.scale(s, s);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Background
  if (state.bgImage) {
    const filters = [];
    if (state.brightness !== 100) filters.push(`brightness(${state.brightness}%)`);
    if (state.contrast !== 100) filters.push(`contrast(${state.contrast}%)`);
    if (state.saturate !== 100) filters.push(`saturate(${state.saturate}%)`);
    if (state.hueRotate !== 0) filters.push(`hue-rotate(${state.hueRotate}deg)`);
    ctx.filter = filters.length ? filters.join(' ') : 'none';
    drawCover(ctx, state.bgImage, dim.width, dim.height, bgPlacement[dimIndex]);
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, dim.width, dim.height);
  }

  // 2. Overlay
  const [r, g, b] = hexToRgb(state.overlayColor);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${state.overlayOpacity})`;
  ctx.fillRect(0, 0, dim.width, dim.height);

  // 3. Logo (skip if noLogo option)
  if (!opts.noLogo) {
    await drawLogo(ctx, dim, s);
  }
}

async function drawLogo(ctx, dim, s) {
  const L = LOGO;
  // Scale the logo to fit the target logoWidth
  const logoDrawW = dim.logoWidth;
  const logoDrawH = dim.logoWidth * (LOGO_NATIVE_H / LOGO_NATIVE_W);

  const baseScale = dim.logoWidth / 399.633; // base scale for season text sizing
  const gap = L.gap * baseScale;
  const seasonFontSize = L.seasonFontSize * baseScale;
  const seasonLineH = seasonFontSize * 1.2;
  // CTA button adds extra height for email cover (24px fixed gap)
  const ctaGap = dim.cta ? 24 : 0;
  const ctaH = dim.cta ? 41 : 0;
  const totalH = logoDrawH + gap + seasonLineH + ctaGap + ctaH;

  const startX = (dim.width - logoDrawW) / 2;
  const startY = (dim.height - totalH) / 2;

  // Rasterize logo SVG at exact pixel size needed (no bitmap scaling)
  if (logoSvgText) {
    const pixelW = Math.round(logoDrawW * s);
    const pixelH = Math.round(logoDrawH * s);
    const logoImg = await getLogoAtSize(pixelW, pixelH);
    ctx.drawImage(logoImg, startX, startY, logoDrawW, logoDrawH);
  }

  // Draw season text (right-aligned to logo right edge)
  if (state.seasonText) {
    ctx.save();
    ctx.font = `500 ${seasonFontSize}px "Baloo 2"`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.letterSpacing = `${L.seasonTracking * baseScale}px`;
    const seasonY = startY + logoDrawH + gap;
    const logoRightEdge = startX + logoDrawW;
    ctx.fillText(state.seasonText, logoRightEdge, seasonY);
    ctx.restore();
  }

  // Draw CTA button (email cover only)
  if (dim.cta) {
    const btnW = 135;
    const btnH = 41;
    const btnX = (dim.width - btnW) / 2;
    const logoSeasonBottom = startY + logoDrawH + gap + seasonLineH;
    const btnY = logoSeasonBottom + 24;

    // Button background
    ctx.save();
    ctx.fillStyle = '#785800';
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 4);
    ctx.fill();

    // Button text
    ctx.font = '400 14px Inter';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Start Reading', btnX + btnW / 2, btnY + btnH / 2);
    ctx.restore();
  }
}

// Draw image with "cover" behavior + placement offsets
function drawCover(ctx, img, canvasW, canvasH, placement) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = canvasW / canvasH;
  const bgScale = (placement ? placement.scale : 100) / 100;

  let baseW, baseH;

  // Calculate base cover dimensions (minimum size to fill canvas)
  if (imgRatio > canvasRatio) {
    baseH = canvasH;
    baseW = canvasH * imgRatio;
  } else {
    baseW = canvasW;
    baseH = canvasW / imgRatio;
  }

  // Apply scale on top of the base cover size
  const drawW = baseW * bgScale;
  const drawH = baseH * bgScale;

  // Center + offset (offset is % of canvas dimension)
  const ox = placement ? (placement.offsetX / 100) * canvasW : 0;
  const oy = placement ? (placement.offsetY / 100) * canvasH : 0;
  const drawX = (canvasW - drawW) / 2 + ox;
  const drawY = (canvasH - drawH) / 2 + oy;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// === Export ===
async function exportDimension(dimIndex, opts = {}) {
  const dim = DIMENSIONS[dimIndex];
  const canvas = document.createElement('canvas');
  await renderToCanvas(canvas, dim, dimIndex, { ...opts, scale: RENDER_SCALE });

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const pw = Math.round(dim.width * RENDER_SCALE);
    const ph = Math.round(dim.height * RENDER_SCALE);
    const suffix = opts.noLogo ? '-bg-only' : '';
    a.download = `chan-magazine-${pw}x${ph}${suffix}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function exportAll() {
  DIMENSIONS.forEach((_, i) => {
    setTimeout(() => exportDimension(i), i * 300);
  });
}

// === Unsplash ===
async function searchUnsplash(query, page = 1) {
  if (!unsplashKey) {
    alert('Please enter your Unsplash API access key first.');
    return null;
  }

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=12&client_id=${unsplashKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Unsplash API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    alert('Unsplash search failed: ' + err.message);
    return null;
  }
}

function renderUnsplashResults(data, append = false) {
  const container = document.getElementById('unsplashResults');
  const pagination = document.getElementById('unsplashPagination');

  if (!append) container.innerHTML = '';

  if (!data || !data.results || data.results.length === 0) {
    if (!append) {
      container.innerHTML = '<div class="empty-state">No results found</div>';
    }
    pagination.classList.add('hidden');
    return;
  }

  data.results.forEach((photo) => {
    const item = document.createElement('div');
    item.className = 'photo-item';
    item.innerHTML = `
      <img src="${photo.urls.small}" alt="${photo.alt_description || ''}">
      <div class="photo-credit">Photo by ${photo.user.name}</div>
    `;
    item.addEventListener('click', () => loadUnsplashPhoto(photo));
    container.appendChild(item);
  });

  if (data.total_pages > unsplashPage) {
    pagination.classList.remove('hidden');
  } else {
    pagination.classList.add('hidden');
  }
}

async function loadUnsplashPhoto(photo) {
  try {
    const img = await loadImage(photo.urls.regular);
    state.bgImage = img;
    document.getElementById('imageInfo').textContent =
      `Photo by ${photo.user.name} on Unsplash (${img.naturalWidth}×${img.naturalHeight})`;
    document.getElementById('unsplashModal').classList.add('hidden');
    render();
  } catch (err) {
    alert('Failed to load image: ' + err.message);
  }
}

// === Placement UI sync ===
function syncPlacementUI() {
  const p = bgPlacement[state.selectedDimension];
  document.getElementById('bgScale').value = p.scale;
  document.getElementById('bgScaleValue').textContent = p.scale + '%';
  document.getElementById('bgOffsetX').value = p.offsetX;
  document.getElementById('bgOffsetXValue').textContent = p.offsetX;
  document.getElementById('bgOffsetY').value = p.offsetY;
  document.getElementById('bgOffsetYValue').textContent = p.offsetY;
}

// === Event Binding ===
function bindEvents() {
  // Season text
  document.getElementById('seasonText').addEventListener('input', (e) => {
    state.seasonText = e.target.value;
    render();
  });

  // File upload
  document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });

  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const img = await loadImage(ev.target.result);
        state.bgImage = img;
        document.getElementById('imageInfo').textContent =
          `${file.name} (${img.naturalWidth}×${img.naturalHeight})`;
        render();
      } catch (err) {
        alert('Failed to load image');
      }
    };
    reader.readAsDataURL(file);
  });

  // Overlay
  document.getElementById('overlayColor').addEventListener('input', (e) => {
    state.overlayColor = e.target.value;
    render();
  });

  bindSlider('overlayOpacity', 'opacityValue', (v) => {
    state.overlayOpacity = v / 100;
    render();
  }, '%');

  // Adjustments
  bindSlider('brightness', 'brightnessValue', (v) => {
    state.brightness = v;
    render();
  }, '');

  bindSlider('contrast', 'contrastValue', (v) => {
    state.contrast = v;
    render();
  }, '');

  bindSlider('saturate', 'saturateValue', (v) => {
    state.saturate = v;
    render();
  }, '');

  bindSlider('hueRotate', 'hueRotateValue', (v) => {
    state.hueRotate = v;
    render();
  }, '\u00B0');

  // Per-format placement sliders
  bindSlider('bgScale', 'bgScaleValue', (v) => {
    bgPlacement[state.selectedDimension].scale = v;
    render();
  }, '%');

  bindSlider('bgOffsetX', 'bgOffsetXValue', (v) => {
    bgPlacement[state.selectedDimension].offsetX = v;
    render();
  }, '');

  bindSlider('bgOffsetY', 'bgOffsetYValue', (v) => {
    bgPlacement[state.selectedDimension].offsetY = v;
    render();
  }, '');

  document.getElementById('resetPlacement').addEventListener('click', () => {
    const p = bgPlacement[state.selectedDimension];
    p.scale = 100;
    p.offsetX = 0;
    p.offsetY = 0;
    syncPlacementUI();
    render();
  });

  // Dimension tabs
  document.querySelectorAll('.dim-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dim-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.selectedDimension = parseInt(tab.dataset.dim);
      syncPlacementUI();
      render();
    });
  });

  // Export buttons
  document.querySelectorAll('.export-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      exportDimension(parseInt(btn.dataset.dim));
    });
  });

  document.getElementById('exportAllBtn').addEventListener('click', exportAll);

  // Banner bg-only export
  document.getElementById('exportBannerBgBtn').addEventListener('click', () => {
    exportDimension(0, { noLogo: true });
  });

  // Unsplash modal
  document.getElementById('unsplashBtn').addEventListener('click', () => {
    document.getElementById('unsplashModal').classList.remove('hidden');
    if (unsplashKey) {
      document.getElementById('unsplashKey').value = unsplashKey;
    }
  });

  document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('unsplashModal').classList.add('hidden');
  });

  document.getElementById('unsplashModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden');
    }
  });

  document.getElementById('saveKeyBtn').addEventListener('click', () => {
    unsplashKey = document.getElementById('unsplashKey').value.trim();
    localStorage.setItem('unsplash_key', unsplashKey);
  });

  document.getElementById('searchBtn').addEventListener('click', async () => {
    unsplashQuery = document.getElementById('unsplashSearch').value.trim();
    if (!unsplashQuery) return;
    unsplashPage = 1;
    const data = await searchUnsplash(unsplashQuery, unsplashPage);
    renderUnsplashResults(data);
  });

  document.getElementById('unsplashSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('searchBtn').click();
  });

  document.getElementById('loadMoreBtn').addEventListener('click', async () => {
    unsplashPage++;
    const data = await searchUnsplash(unsplashQuery, unsplashPage);
    renderUnsplashResults(data, true);
  });
}

function bindSlider(sliderId, valueId, onChange, unit) {
  const slider = document.getElementById(sliderId);
  const display = document.getElementById(valueId);
  slider.addEventListener('input', () => {
    const v = parseInt(slider.value);
    display.textContent = v + unit;
    onChange(v);
  });
}

// === Start ===
init();
