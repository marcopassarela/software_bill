/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backend =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:8000';
    return [
      {
        source: '/backend/:path*',
        destination: `${backend.replace(/\/$/, '')}/:path*`,
      },
    ];
  },
};

export default nextConfig;