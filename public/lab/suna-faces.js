// Suna's faces, lifted from the canvas export.
//
// Brief: PROMPT-LAB-UI-DECISIONS-BUILD.md §2. "Take the layout, copy, spacing
// and the mascot's SVG and keyframes from these files." One face per state,
// each tied to a real stage event — no fake struggle: if she says she is
// going wider, the search really went wider.
//
// Generated from docs/lab/design/decisions-canvas/project/Suna.dc.html.
// Re-run scripts/lab-extract-mascot.mjs when the canvas changes; do not hand-edit.

export const SUNA_FACES = {
  idle: `<svg class="sn" viewBox="0 0 80 96" aria-label="Suna, idle: bobbing and blinking" role="img" style="overflow: visible;">
          <g class="sn-bob">
            <ellipse cx="32" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
            <ellipse cx="48" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
            <path d="M40 4C56 4 64 17 64 35C64 55 55 68 40 68C25 68 16 55 16 35C16 17 24 4 40 4Z" fill="#D4A373"></path>
            <ellipse cx="31" cy="10.5" rx="7" ry="2.8" fill="#E6C39A" opacity="0.6"></ellipse>
            <path d="M17 40C11 54 12 74 15 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            <path d="M63 40C69 54 68 74 65 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            <rect x="22" y="15" width="36" height="22" rx="11" fill="#151416"></rect>
            <path d="M27 19.5Q31 17.5 36 18" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.4" stroke-linecap="round"></path>
            <ellipse class="sn-blink" cx="33" cy="25.5" rx="3.2" ry="4.2" fill="#FFE7A8"></ellipse>
            <ellipse class="sn-blink" cx="47" cy="25.5" rx="3.2" ry="4.2" fill="#FFE7A8"></ellipse>
            <path d="M37.5 31.5Q40 33.5 42.5 31.5" fill="none" stroke="#FFE7A8" stroke-width="1.5" stroke-linecap="round"></path>
          </g>
        </svg>`,
  searching: `<svg class="sn" viewBox="0 0 80 96" aria-label="Suna, searching: side-eye, glancing left and right" role="img" style="overflow: visible;">
          <g class="sn-lean">
            <ellipse cx="32" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
            <ellipse cx="48" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
            <path d="M40 4C56 4 64 17 64 35C64 55 55 68 40 68C25 68 16 55 16 35C16 17 24 4 40 4Z" fill="#D4A373"></path>
            <ellipse cx="31" cy="10.5" rx="7" ry="2.8" fill="#E6C39A" opacity="0.6"></ellipse>
            <path d="M17 40C11 54 12 74 15 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            <path d="M63 40C69 54 68 74 65 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            <rect x="22" y="15" width="36" height="22" rx="11" fill="#151416"></rect>
            <path d="M27 19.5Q31 17.5 36 18" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.4" stroke-linecap="round"></path>
            <g class="sn-glance">
              <ellipse cx="36" cy="27" rx="3.3" ry="2.6" fill="#FFE7A8"></ellipse>
              <ellipse cx="50" cy="27" rx="3.3" ry="2.6" fill="#FFE7A8"></ellipse>
              <rect x="31" y="23" width="24" height="3.4" fill="#151416"></rect>
            </g>
            <path d="M39 32.5H44" fill="none" stroke="#FFE7A8" stroke-width="1.5" stroke-linecap="round"></path>
          </g>
        </svg>`,
  slow: `<svg class="sn" viewBox="0 0 80 96" aria-label="Suna, slow: sweat drop sliding down, bobbing fast" role="img" style="overflow: visible;">
          <g class="sn-bob-fast">
            <ellipse cx="32" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
            <ellipse cx="48" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
            <path d="M40 4C56 4 64 17 64 35C64 55 55 68 40 68C25 68 16 55 16 35C16 17 24 4 40 4Z" fill="#D4A373"></path>
            <ellipse cx="31" cy="10.5" rx="7" ry="2.8" fill="#E6C39A" opacity="0.6"></ellipse>
            <path d="M17 40C11 54 12 74 15 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            <path d="M63 40C69 54 68 74 65 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            <rect x="22" y="15" width="36" height="22" rx="11" fill="#151416"></rect>
            <path d="M27 19.5Q31 17.5 36 18" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.4" stroke-linecap="round"></path>
            <ellipse cx="33" cy="25" rx="3" ry="3.8" fill="#FFE7A8"></ellipse>
            <ellipse cx="47" cy="25" rx="3" ry="3.8" fill="#FFE7A8"></ellipse>
            <path d="M36 32.5q1 -1.2 2 0t2 0t2 0t2 0" fill="none" stroke="#FFE7A8" stroke-width="1.4" stroke-linecap="round"></path>
            <path class="sn-sweat" d="M59 9C59 9 55.5 13.5 55.5 15.5A3.5 3.5 0 0 0 62.5 15.5C62.5 13.5 59 9 59 9Z" fill="#9FD0EE"></path>
          </g>
        </svg>`,
  mismatch: `<svg class="sn" viewBox="0 0 80 96" aria-label="Suna, location mismatch: head tilt, squinting" role="img" style="overflow: visible;">
          <g class="sn-tilt">
            <ellipse cx="32" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
            <ellipse cx="48" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
            <path d="M40 4C56 4 64 17 64 35C64 55 55 68 40 68C25 68 16 55 16 35C16 17 24 4 40 4Z" fill="#D4A373"></path>
            <ellipse cx="31" cy="10.5" rx="7" ry="2.8" fill="#E6C39A" opacity="0.6"></ellipse>
            <path d="M17 40C11 54 12 74 15 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            <path d="M63 40C69 54 68 74 65 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            <rect x="22" y="15" width="36" height="22" rx="11" fill="#151416"></rect>
            <path d="M27 19.5Q31 17.5 36 18" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.4" stroke-linecap="round"></path>
            <ellipse class="sn-squint" cx="33" cy="26" rx="3.6" ry="1.3" fill="#FFE7A8"></ellipse>
            <ellipse class="sn-squint" cx="47" cy="26" rx="3.6" ry="1.3" fill="#FFE7A8"></ellipse>
            <circle cx="40" cy="32" r="1.4" fill="none" stroke="#FFE7A8" stroke-width="1.3"></circle>
          </g>
        </svg>`,
  found: `<svg class="sn" viewBox="0 0 80 96" aria-label="Suna, found: hopping, arms up, sparkling eyes" role="img" style="overflow: visible;">
          <g class="sn-hop">
            <ellipse cx="32" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
            <ellipse cx="48" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
            <path d="M40 4C56 4 64 17 64 35C64 55 55 68 40 68C25 68 16 55 16 35C16 17 24 4 40 4Z" fill="#D4A373"></path>
            <ellipse cx="31" cy="10.5" rx="7" ry="2.8" fill="#E6C39A" opacity="0.6"></ellipse>
            <path class="sn-wave-l" d="M17 38C9 30 8 18 11 7" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            <path class="sn-wave-r" d="M63 38C71 30 72 18 69 7" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            <rect x="22" y="15" width="36" height="22" rx="11" fill="#151416"></rect>
            <path d="M27 19.5Q31 17.5 36 18" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.4" stroke-linecap="round"></path>
            <path class="sn-pulse" d="M33 21L34.2 24.8L38 26L34.2 27.2L33 31L31.8 27.2L28 26L31.8 24.8Z" fill="#FFE7A8"></path>
            <path class="sn-pulse" d="M47 21L48.2 24.8L52 26L48.2 27.2L47 31L45.8 27.2L42 26L45.8 24.8Z" fill="#FFE7A8"></path>
            <path d="M37 32.2Q40 36 43 32.2Z" fill="#FFE7A8"></path>
            <path class="sn-pulse-late" d="M4 26L5 28.6L7.6 29.6L5 30.6L4 33.2L3 30.6L0.4 29.6L3 28.6Z" fill="#FFE7A8"></path>
            <path class="sn-pulse-late" d="M76 18L77 20.6L79.6 21.6L77 22.6L76 25.2L75 22.6L72.4 21.6L75 20.6Z" fill="#FFE7A8"></path>
          </g>
        </svg>`,
  pout: `<svg class="sn" viewBox="0 0 80 96" aria-label="Suna, pouting: drooping, arms hanging low" role="img" style="overflow: visible;">
          <ellipse cx="32" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
          <ellipse cx="48" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
          <g class="sn-droop">
            <path d="M40 4C56 4 64 17 64 35C64 55 55 68 40 68C25 68 16 55 16 35C16 17 24 4 40 4Z" fill="#D4A373"></path>
            <ellipse cx="31" cy="10.5" rx="7" ry="2.8" fill="#E6C39A" opacity="0.6"></ellipse>
            <g class="sn-hang">
              <path d="M17 40C11 54 12 74 15 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
              <path d="M63 40C69 54 68 74 65 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
            </g>
            <rect x="22" y="15" width="36" height="22" rx="11" fill="#151416"></rect>
            <path d="M27 19.5Q31 17.5 36 18" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.4" stroke-linecap="round"></path>
            <ellipse cx="33" cy="27" rx="3.2" ry="3.4" fill="#FFE7A8"></ellipse>
            <ellipse cx="47" cy="27" rx="3.2" ry="3.4" fill="#FFE7A8"></ellipse>
            <path d="M28 22.5H38.5V24.2L28 27Z" fill="#151416"></path>
            <path d="M41.5 22.5H52V27L41.5 24.2Z" fill="#151416"></path>
            <path d="M37.5 33.5Q40 31.2 42.5 33.5" fill="none" stroke="#FFE7A8" stroke-width="1.5" stroke-linecap="round"></path>
          </g>
        </svg>`,
  sheepish: `<svg class="sn" viewBox="0 0 80 96" aria-label="Suna, sheepish: rubbing the back of her head, looking down" role="img" style="overflow: visible;">
          <ellipse cx="32" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
          <ellipse cx="48" cy="73" rx="6" ry="9" fill="#BF8C57"></ellipse>
          <path d="M40 4C56 4 64 17 64 35C64 55 55 68 40 68C25 68 16 55 16 35C16 17 24 4 40 4Z" fill="#D4A373"></path>
          <ellipse cx="31" cy="10.5" rx="7" ry="2.8" fill="#E6C39A" opacity="0.6"></ellipse>
          <path d="M17 40C11 54 12 74 15 90" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
          <path class="sn-rub" d="M63 40C72 34 72 18 62 9" fill="none" stroke="#D4A373" stroke-width="3.4" stroke-linecap="round"></path>
          <rect x="22" y="15" width="36" height="22" rx="11" fill="#151416"></rect>
          <path d="M27 19.5Q31 17.5 36 18" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.4" stroke-linecap="round"></path>
          <g class="sn-look">
            <ellipse cx="33" cy="26" rx="2.8" ry="2.6" fill="#FFE7A8"></ellipse>
            <ellipse cx="47" cy="26" rx="2.8" ry="2.6" fill="#FFE7A8"></ellipse>
          </g>
          <path d="M37 32Q38.5 33.5 40 32.3Q41.5 33.5 43 32" fill="none" stroke="#FFE7A8" stroke-width="1.5" stroke-linecap="round"></path>
        </svg>`,
};

export const SUNA_CSS = `
@keyframes sn-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes sn-blink { 0%, 90%, 100% { transform: scaleY(1); } 94% { transform: scaleY(0.1); } }
@keyframes sn-lean { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-4deg); } }
@keyframes sn-glance { 0%, 100% { transform: translateX(0); } 25%, 45% { transform: translateX(-7px); } 65%, 85% { transform: translateX(0); } }
@keyframes sn-sweat { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 80% { opacity: 1; } 100% { transform: translateY(14px); opacity: 0; } }
@keyframes sn-tilt { 0%, 100% { transform: rotate(0deg); } 30%, 60% { transform: rotate(-7deg); } }
@keyframes sn-squint { 0%, 35%, 100% { transform: scaleY(1); } 50%, 75% { transform: scaleY(2.6); } }
@keyframes sn-hop { 0%, 40%, 100% { transform: translateY(0); } 18% { transform: translateY(-8px); } }
@keyframes sn-wave-l { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-8deg); } }
@keyframes sn-wave-r { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(8deg); } }
@keyframes sn-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.65); opacity: 0.75; } }
@keyframes sn-droop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(2.5px); } }
@keyframes sn-hang { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3px); } }
@keyframes sn-rub { 0% { transform: rotate(-6deg); } 100% { transform: rotate(8deg); } }
@keyframes sn-look { 0%, 100% { transform: translateY(0); } 40%, 80% { transform: translateY(2.5px); } }
.sn-bob { animation: sn-bob 2.4s ease-in-out infinite; }
.sn-bob-fast { animation: sn-bob 0.8s ease-in-out infinite; }
.sn-blink { transform-box: fill-box; transform-origin: center; animation: sn-blink 3s linear infinite; }
.sn-lean { transform-box: fill-box; transform-origin: 50% 100%; animation: sn-lean 2.8s ease-in-out infinite; }
.sn-glance { animation: sn-glance 2.8s ease-in-out infinite; }
.sn-sweat { animation: sn-sweat 1.5s ease-in infinite; }
.sn-tilt { transform-box: fill-box; transform-origin: 50% 100%; animation: sn-tilt 2.6s ease-in-out infinite; }
.sn-squint { transform-box: fill-box; transform-origin: center; animation: sn-squint 2.6s ease-in-out infinite; }
.sn-hop { animation: sn-hop 1.8s ease-out infinite; }
.sn-wave-l { transform-box: fill-box; transform-origin: 100% 100%; animation: sn-wave-l 1.8s ease-in-out infinite; }
.sn-wave-r { transform-box: fill-box; transform-origin: 0% 100%; animation: sn-wave-r 1.8s ease-in-out infinite; }
.sn-pulse { transform-box: fill-box; transform-origin: center; animation: sn-pulse 1.6s ease-in-out infinite; }
.sn-pulse-late { transform-box: fill-box; transform-origin: center; animation: sn-pulse 1.6s ease-in-out 0.5s infinite; }
.sn-droop { animation: sn-droop 2.6s ease-in-out infinite; }
.sn-hang { animation: sn-hang 2.6s ease-in-out infinite; }
.sn-rub { transform-box: fill-box; transform-origin: 0% 100%; animation: sn-rub 0.8s ease-in-out infinite alternate; }
.sn-look { animation: sn-look 2.4s ease-in-out infinite; }

/* Respect Reduce Motion: she holds still rather than disappearing. */
@media (prefers-reduced-motion: reduce) {
  .suna svg, .suna svg * { animation: none !important; }
}
`;
