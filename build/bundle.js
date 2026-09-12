// build/bundle.js - 用 esbuild 将服务端代码打包成单文件，供 SEA 打包使用
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function main() {
  // 清理旧产物
  const distDir = path.join(__dirname, '..', 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const ver = process.env.PACKAGE_BUILD_VERSION || pkg.version;

  // 打包 server 代码为 CommonJS
  await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'server', 'main.js')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: path.join(distDir, 'bundle.cjs'),
    // 保留内置模块
    external: [],
    // 标记 node:sea 避免打包
    banner: { js: '// Auto-bundled by esbuild' },
    minify: false,
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.PACKAGE_VERSION': JSON.stringify(ver),
    },
  });

  console.log('Bundle built: dist/bundle.cjs');
  const stat = fs.statSync(path.join(distDir, 'bundle.cjs'));
  console.log('Size: ' + (stat.size / 1024).toFixed(1) + ' KB');
}

main().catch((e) => { console.error('Bundle failed:', e); process.exit(1); });