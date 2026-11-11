/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Self-contained server bundle for Docker / plain Node hosting.
  output: "standalone",
  experimental: {
    // Room for a 1 MB logo plus form fields.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
