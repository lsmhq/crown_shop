const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const P = require('./path');

const REPO = process.env.UPDATE_REPO || 'lsmhq/crown_shop';
const API = 'https://api.github.com/repos/' + REPO;
const CURRENT_VERSION = process.env.PACKAGE_VERSION || '0.0.0';

function getJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'crown-shop-updater', Accept: 'application/vnd.github+json' },
      timeout: timeoutMs || 12000,
    }, (res) => {
      if (res.statusCode === 404) { res.resume(); return reject(Object.assign(new Error('未找到发布版本'), { status: 404 })); }
      if (res.statusCode !== 200) { res.resume(); return reject(Object.assign(new Error('HTTP ' + res.statusCode), { status: res.statusCode })); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('请求超时')));
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'crown-shop-updater', Accept: 'application/octet-stream' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode >= 400) { res.resume(); return reject(new Error('下载失败 HTTP ' + res.statusCode)); }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => ws.close(() => resolve(dest)));
      ws.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('下载超时')));
  });
}

function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

async function fetchLatest() {
  const rel = await getJson(API + '/releases/latest');
  if (!rel || !rel.tag_name) return null;
  const asset = (rel.assets || []).find((a) => a.name === 'latest.json');
  if (!asset || !asset.browser_download_url) return null;
  const m = await getJson(asset.browser_download_url);
  if (!m || !m.version || !m.url) return null;
  return {
    version: String(m.version),
    url: String(m.url),
    sha256: String(m.sha256 || ''),
    notes: String(m.notes || rel.name || ''),
    publishedAt: rel.published_at || '',
  };
}

async function check() {
  let latest = null;
  try { latest = await fetchLatest(); } catch (e) { /* 无网络或仓库无发布版本 */ }
  return { current: CURRENT_VERSION, latest, hasUpdate: !!(latest && compareVersions(latest.version, CURRENT_VERSION) > 0) };
}

function sha256Of(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toLowerCase();
}

function runPowerShell(script, opts) {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], Object.assign({ windowsHide: true }, opts || {}));
    let err = '';
    ps.stderr.on('data', (c) => { err += c.toString(); });
    ps.on('error', reject);
    ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error('PowerShell 执行失败: ' + (err || code)))));
  });
}

async function prepare(latest) {
  const tmp = path.join(P.dataDir, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const ver = latest.version;
  const zipPath = path.join(tmp, 'update-' + ver + '.zip');
  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
    await download(latest.url, zipPath);
  }
  if (latest.sha256 && sha256Of(zipPath) !== String(latest.sha256).toLowerCase()) {
    throw new Error('下载文件校验失败（SHA256 不匹配），已停止更新');
  }
  const extractDir = path.join(tmp, 'update-extract');
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  await runPowerShell("Expand-Archive -LiteralPath '" + zipPath + "' -DestinationPath '" + extractDir + "' -Force");
  const newExe = path.join(extractDir, '店长宝.exe');
  if (!fs.existsSync(newExe)) throw new Error('更新包内容不完整：缺少 店长宝.exe');
  return { tmp, zipPath, extractDir, newExe, ver };
}

function launchUpdater(prepared) {
  const { tmp, extractDir, newExe, ver } = prepared;
  const appRoot = P.appRoot;
  const dstExe = process.execPath;
  const srcPub = path.join(extractDir, 'public');
  const dstPub = P.publicDir;
  const ps = path.join(tmp, 'apply-update.ps1');
  const body = [
    '# Auto-generated by crown_shop update',
    'Start-Sleep -Seconds 2',
    'Stop-Process -Name "店长宝" -Force -ErrorAction SilentlyContinue',
    'Start-Sleep -Milliseconds 1500',
    'Stop-Process -Name "店长宝" -Force -ErrorAction SilentlyContinue',
    'Copy-Item -LiteralPath $env:UPD_SRC -Destination $env:UPD_DST -Force',
    'if ($env:UPD_SRC_PUB -and (Test-Path -LiteralPath $env:UPD_SRC_PUB)) { robocopy $env:UPD_SRC_PUB $env:UPD_DST_PUB /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null }',
    'Start-Process -FilePath $env:UPD_LAUNCH -WorkingDirectory $env:UPD_ROOT',
    'Start-Sleep -Seconds 4',
    'if ($env:UPD_TMP -and (Test-Path -LiteralPath $env:UPD_TMP)) { Remove-Item -LiteralPath $env:UPD_TMP -Recurse -Force -ErrorAction SilentlyContinue }',
    'Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue',
    '',
  ].join('\r\n');
  fs.writeFileSync(ps, '\uFEFF' + body);
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: Object.assign({}, process.env, {
      UPD_SRC: newExe,
      UPD_DST: dstExe,
      UPD_SRC_PUB: srcPub,
      UPD_DST_PUB: dstPub,
      UPD_LAUNCH: dstExe,
      UPD_ROOT: appRoot,
      UPD_TMP: tmp,
    }),
  });
  child.unref();
  return { ver };
}

module.exports = { check, prepare, launchUpdater, CURRENT_VERSION, REPO };