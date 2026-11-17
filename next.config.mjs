const isDev = process.env.NODE_ENV !== "production";

// Content Security Policy. Inline scripts are needed by Next.js itself; everything else is locked to
// this site, plus the few services teachers can embed (Google Docs/Slides/Drive, YouTube, Vimeo,
// Microsoft Office viewer, Canva).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "media-src 'self' blob:",
  "frame-src 'self' https://docs.google.com https://drive.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://view.officeapps.live.com https://www.canva.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Self-contained server bundle for Docker / plain Node hosting.
  output: "standalone",
  // The app never uses next/image. Turning the optimizer off removes its whole attack surface.
  images: { unoptimized: true },
  experimental: {
    // Room for a 1 MB logo plus form fields.
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
