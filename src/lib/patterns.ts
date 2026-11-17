// Course "covers": each course gets its own subtle geometric pattern (picked from its id), drawn in
// translucent white over the course colour. Pure SVG data URIs, so nothing is downloaded.

const svg = (body: string, size: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${body}</svg>`)}")`;

const W = "fill='white' fill-opacity='0.16'";
const S = "stroke='white' stroke-opacity='0.2' fill='none'";

const PATTERNS = [
  // dots
  svg(`<circle cx='4' cy='4' r='2' ${W}/><circle cx='16' cy='16' r='2' ${W}/>`, 24),
  // diagonal stripes
  svg(`<path d='M-4 28 L28 -4 M-4 8 L8 -4 M20 28 L28 20' ${S} stroke-width='5'/>`, 24),
  // circles
  svg(`<circle cx='20' cy='20' r='12' ${S} stroke-width='2'/><circle cx='0' cy='0' r='12' ${S} stroke-width='2'/><circle cx='40' cy='40' r='12' ${S} stroke-width='2'/>`, 40),
  // waves
  svg(`<path d='M0 15 Q 10 5 20 15 T 40 15 M0 35 Q 10 25 20 35 T 40 35' ${S} stroke-width='2.5'/>`, 40),
  // triangles
  svg(`<path d='M0 30 L15 4 L30 30 Z' ${W}/>`, 30),
  // grid
  svg(`<path d='M0 .5 H28 M.5 0 V28' ${S} stroke-width='1.5'/>`, 28),
  // plus signs
  svg(`<path d='M14 8 V20 M8 14 H20' ${S} stroke-width='2.5' stroke-linecap='round'/>`, 28),
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** CSS background for a course cover: pattern + soft light from the top-right corner. */
export function coverStyle(id: string) {
  return {
    backgroundImage: `radial-gradient(circle at 88% 12%, rgba(255,255,255,0.32), transparent 52%), ${PATTERNS[hash(id) % PATTERNS.length]}`,
  };
}

/** Just the pattern (no light), for large areas with white text on top. */
export function patternStyle(id: string) {
  return { backgroundImage: PATTERNS[hash(id) % PATTERNS.length] };
}
