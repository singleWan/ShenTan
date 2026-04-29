/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', '@libsql/client'],
  optimizePackageImports: ['react-force-graph-2d'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  poweredByHeader: false,
  webpack: (config) => {
    // 解决 monorepo 中 TypeScript 包使用 .js 后缀导入的问题
    // ESM 规范要求 .js 后缀，但 TypeScript 源文件是 .ts
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
