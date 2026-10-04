// Procedural vector illustration generator for story scenes based on genre and keywords

export function generateSceneSVG(genre = 'fantasy', mood = 'mysterious', keywords = '') {
  const g = (genre || '').toLowerCase();
  const kw = (keywords || '').toLowerCase();

  let skyGradient = ['#1a103c', '#2b1b54', '#482880'];
  let horizonColor = '#0d091e';
  let accentColor = '#8155ba';
  let starsColor = '#ffffff';

  if (g.includes('cyber') || kw.includes('neon') || kw.includes('tech') || kw.includes('city')) {
    skyGradient = ['#05081c', '#101438', '#1a205a'];
    horizonColor = '#030511';
    accentColor = '#00f0ff';
  } else if (g.includes('horror') || g.includes('eldritch') || kw.includes('dark') || kw.includes('crypt')) {
    skyGradient = ['#0d1418', '#142022', '#1b2a2a'];
    horizonColor = '#050a0b';
    accentColor = '#4ae3b5';
  } else if (g.includes('sci-fi') || g.includes('space') || kw.includes('star') || kw.includes('ship')) {
    skyGradient = ['#00030a', '#061329', '#0d274d'];
    horizonColor = '#000208';
    accentColor = '#70a6ff';
  }

  // Generate random stars / particles
  let stars = '';
  for (let i = 0; i < 28; i++) {
    const cx = Math.floor(Math.random() * 800);
    const cy = Math.floor(Math.random() * 120);
    const r = (Math.random() * 1.5 + 0.5).toFixed(1);
    const opacity = (Math.random() * 0.7 + 0.3).toFixed(2);
    stars += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${starsColor}" opacity="${opacity}" />`;
  }

  // Distinct landmark based on genre
  let landmark = '';
  if (g.includes('cyber') || kw.includes('city') || kw.includes('tower')) {
    // Futuristic skyscrapers with glowing windows
    landmark = `
      <rect x="120" y="60" width="80" height="140" fill="#090e24" />
      <rect x="220" y="40" width="110" height="160" fill="#0c1330" />
      <rect x="360" y="80" width="70" height="120" fill="#070b1c" />
      <rect x="460" y="30" width="90" height="170" fill="#0d1538" />
      <rect x="580" y="70" width="100" height="130" fill="#0a0f28" />
      <!-- Glowing Antenna & Neon bands -->
      <line x1="275" y1="15" x2="275" y2="40" stroke="${accentColor}" stroke-width="2" />
      <circle cx="275" cy="15" r="4" fill="${accentColor}" />
      <line x1="505" y1="10" x2="505" y2="30" stroke="#ff007f" stroke-width="2" />
      <circle cx="505" cy="10" r="3" fill="#ff007f" />
      <!-- Neon grid lines -->
      <rect x="240" y="60" width="70" height="4" fill="${accentColor}" opacity="0.8" />
      <rect x="480" y="90" width="50" height="4" fill="#ff007f" opacity="0.8" />
      <rect x="140" y="100" width="40" height="4" fill="${accentColor}" opacity="0.6" />
    `;
  } else if (g.includes('space') || kw.includes('ship') || kw.includes('planet')) {
    // Giant celestial ring or orbital station
    landmark = `
      <circle cx="650" cy="70" r="55" fill="url(#planetGlow)" />
      <ellipse cx="650" cy="70" rx="90" ry="18" fill="none" stroke="${accentColor}" stroke-width="3" opacity="0.7" transform="rotate(-20 650 70)" />
      <!-- Spaceship Silhouette -->
      <path d="M 180 90 Q 240 70 300 85 Q 320 88 340 80 Q 300 110 200 100 Z" fill="#0b162c" stroke="${accentColor}" stroke-width="1" />
      <circle cx="340" cy="80" r="3" fill="${accentColor}" opacity="0.9" />
    `;
  } else if (g.includes('horror') || kw.includes('ruins') || kw.includes('crypt')) {
    // Spooky gothic monoliths & twisted trees
    landmark = `
      <path d="M 160 200 L 190 70 L 220 200 Z" fill="#080e10" />
      <path d="M 280 200 L 310 90 L 330 200 Z" fill="#0c161a" />
      <path d="M 520 200 L 560 50 L 590 200 Z" fill="#080e10" />
      <!-- Eerie Green/Cyan Moon -->
      <circle cx="680" cy="60" r="35" fill="${accentColor}" opacity="0.25" filter="blur(8px)" />
      <circle cx="680" cy="60" r="28" fill="#e0fff5" opacity="0.9" />
    `;
  } else {
    // High fantasy floating islands & castle spires
    landmark = `
      <!-- Floating Archipelago Island 1 -->
      <path d="M 200 120 Q 300 100 420 120 Q 350 170 310 185 Q 260 160 200 120 Z" fill="#140f2e" stroke="${accentColor}" stroke-width="1" />
      <!-- Castle spires on top of island -->
      <rect x="280" y="70" width="20" height="50" fill="#0d0920" />
      <polygon points="275,70 290,40 305,70" fill="#2d1c5a" />
      <rect x="320" y="85" width="28" height="35" fill="#0d0920" />
      <polygon points="315,85 334,55 353,85" fill="#2d1c5a" />
      <!-- Magic Leyline Beam -->
      <line x1="310" y1="185" x2="310" y2="200" stroke="${accentColor}" stroke-width="3" stroke-dasharray="4,4" opacity="0.8" />
      <!-- Crescent Luminous Moon -->
      <circle cx="680" cy="50" r="32" fill="#eaddff" opacity="0.85" />
      <circle cx="692" cy="45" r="28" fill="#2b1b54" />
    `;
  }

  return `
    <svg viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${skyGradient[0]}" />
          <stop offset="60%" stop-color="${skyGradient[1]}" />
          <stop offset="100%" stop-color="${skyGradient[2]}" />
        </linearGradient>
        <linearGradient id="planetGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4e8cff" />
          <stop offset="100%" stop-color="#1a205a" />
        </linearGradient>
      </defs>
      <!-- Background Sky -->
      <rect x="0" y="0" width="800" height="200" fill="url(#skyGrad)" />
      <!-- Stars Layer -->
      ${stars}
      <!-- Landmarks / Spires / Skylines -->
      ${landmark}
      <!-- Rolling Mountain / Ground Horizon Silhouette -->
      <path d="M 0 170 Q 150 140 320 165 T 640 150 Q 730 140 800 160 L 800 200 L 0 200 Z" fill="${horizonColor}" opacity="0.95" />
      <path d="M 0 185 Q 220 165 440 185 T 800 180 L 800 200 L 0 200 Z" fill="#04020a" />
    </svg>
  `;
}

/**
 * Generates either a Diffusers ROCm AI illustration or a procedural SVG
 */
export async function getSceneVisualHTML({ genre = 'fantasy', mood = 'mysterious', text = '', settings = {} }) {
  const provider = settings.imageProvider || (settings.generateArt ? 'diffusers' : 'none');

  if (provider === 'none') {
    return '';
  }

  if (provider === 'diffusers') {
    try {
      // Extract a summary prompt snippet from the turn text
      const promptSnippet = text.slice(0, 200).replace(/\n/g, ' ');
      const res = await fetch('/api/ai/generate-scene-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptSnippet || `${genre} landscape, ${mood} environment`,
          genre: genre,
          mood: mood,
          host: settings.diffusersHost || 'http://localhost:8001',
          steps: settings.diffusersSteps || 4,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const src = data.file_url || data.data_url;
        if (src) {
          return `
            <div class="diffusers-scene-image-wrapper" style="position: relative; border-radius: 16px; overflow: hidden; max-height: 280px; box-shadow: 0 4px 16px rgba(0,0,0,0.25);">
              <img src="${src}" alt="Scene illustration" style="width: 100%; height: 280px; object-fit: cover; display: block;" />
              <div style="position: absolute; bottom: 8px; right: 12px; background: rgba(0,0,0,0.65); backdrop-filter: blur(8px); border-radius: 20px; padding: 2px 10px; font-size: 11px; color: #fff; font-weight: 500; display: flex; align-items: center; gap: 4px;">
                <md-icon name="photo_spark" size="14" style="color: #67ffba;"></md-icon> ROCm Diffusers (${data.generation_time_seconds || 1}s)
              </div>
            </div>
          `;
        }
      }
    } catch (err) {
      console.warn('Diffusers service failed, falling back to procedural SVG vector card', err);
    }
  }

  // Fallback to procedural vector SVG
  return generateSceneSVG(genre, mood, text);
}
