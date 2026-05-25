/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Static export does not support next.config.js redirects.
  // We handle the root route in app/page.tsx
};

export default nextConfig;
