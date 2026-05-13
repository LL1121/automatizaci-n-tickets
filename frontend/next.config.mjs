/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/favicon.svg", permanent: false }];
  },
};

export default nextConfig;
