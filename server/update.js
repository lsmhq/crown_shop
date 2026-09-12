const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const P = require('./path');

const REPO = process.env.UPDATE_REPO || 'lsmhq/crown_shop';
const API = process.env.UPDATE_API_BASE || ('https://api.github.com/repos/' + REPO);
const CURRENT_VERSION = process.env.PACKAGE_VERSION || '0.0.0';

function getJson(url, timeoutMs) {
  const mod = url.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, {
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
  const logPath = path.join(tmp, 'update.log');
  const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const body = [
    '# Auto-generated by crown_shop update',
    '$ErrorActionPreference = "Continue"',
    '$logPath = ' + sq(logPath),
    'function Step($m) { try { Add-Content -LiteralPath $logPath -Value ((Get-Date -Format "HH:mm:ss.fff") + " " + $m) -Encoding UTF8 } catch {} }',
    '$src = ' + sq(newExe),
    '$dst = ' + sq(dstExe),
    '$srcPub = ' + sq(srcPub),
    '$dstPub = ' + sq(dstPub),
    '$launch = ' + sq(dstExe),
    '$root = ' + sq(appRoot),
    '$tmpDir = ' + sq(tmp),
    'Step "updater start"',
    'Start-Sleep -Seconds 8',
    'Step "kill old begin"',
    'taskkill /F /IM 店长宝.exe 2> $null | Out-Null',
    'Start-Sleep -Milliseconds 1200',
    'taskkill /F /IM 店长宝.exe 2> $null | Out-Null',
    'for ($i = 0; $i -lt 30; $i++) { if (Get-Process 店长宝 -ErrorAction SilentlyContinue) { if ($i -eq 0) { Step "wait old exit" }; Start-Sleep -Milliseconds 300 } else { break } }',
    'Step "kill old done"',
    '$copied = $false',
    '$srcLen = (Get-Item -LiteralPath $src -ErrorAction SilentlyContinue).Length',
    '$t0 = Get-Date',
    'for ($i = 0; $i -lt 30; $i++) {',
    '  try { Copy-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop; $it = Get-Item -LiteralPath $dst -ErrorAction SilentlyContinue; if ($it -and $it.Length -eq $srcLen -and $it.LastWriteTime -ge $t0) { $copied = $true; Step ("copy ok on try " + ($i + 1)); break } else { Step ("copy try " + ($i + 1) + ": size mismatch") } } catch { Step ("copy try " + ($i + 1) + " err: " + $_.Exception.Message) }',
    '  Start-Sleep -Milliseconds 500',
    '}',
    'Step ("copied=" + $copied)',
    'if (Test-Path -LiteralPath $srcPub) { try { robocopy $srcPub $dstPub /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null; Step "public copied" } catch { Step "public copy err: " + $_.Exception.Message } }',
    'if ($copied) { Start-Process -FilePath $launch -WorkingDirectory $root; Step "launched new" } else { Step "COPY_FAILED not launching" }',
    'Start-Sleep -Seconds 4',
    'Step "cleanup begin"',
    'schtasks /Delete /TN crown_shop_update /F 2> $null | Out-Null',
    'Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue',
    'Step "updater done"',
    '',
  ].join('\r\n');
  fs.writeFileSync(ps, '\uFEFF' + body);
  const taskName = 'crown_shop_update';
  const xmlPath = path.join(tmp, 'task.xml');
  const xml = '<?xml version="1.0" encoding="UTF-16"?>\r\n' +
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\r\n' +
    '  <RegistrationInfo><Description>crown shop auto updater</Description></RegistrationInfo>\r\n' +
    '  <Triggers><TimeTrigger><StartBoundary>2099-01-01T00:00:00</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>\r\n' +
    '  <Principals><Principal id="Author"><UserId>S-1-5-18</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>\r\n' +
    '  <Settings><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><ExecutionTimeLimit>PT10M</ExecutionTimeLimit><AllowStartOnDemand>true</AllowStartOnDemand></Settings>\r\n' +
    '  <Actions Context="Author">\r\n' +
    '    <Exec>\r\n' +
    '      <Command>powershell.exe</Command>\r\n' +
    '      <Arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ps + '"</Arguments>\r\n' +
    '    </Exec>\r\n' +
    '  </Actions>\r\n' +
    '</Task>\r\n';
  fs.writeFileSync(xmlPath, '\uFEFF' + xml, { encoding: 'utf16le' });
  function run(args) {
    return new Promise((resolve) => {
      const c = spawn('schtasks.exe', args, { windowsHide: true });
      let out = '';
      c.stdout.on('data', (d) => { out += d.toString(); });
      c.stderr.on('data', (d) => { out += d.toString(); });
      c.on('error', () => resolve({ code: -1, out }));
      c.on('close', (code) => { c.unref(); resolve({ code, out }); });
    });
  }
  return run(['/Delete', '/TN', taskName, '/F']).then(() =>
    run(['/Create', '/TN', taskName, '/XML', xmlPath, '/F'])
  ).then((cr) => {
    if (cr.code !== 0) throw new Error('创建计划任务失败: ' + (cr.out || cr.code));
    return run(['/Run', '/TN', taskName]);
  }).then(() => ({ ver }));
}

module.exports = { check, prepare, launchUpdater, CURRENT_VERSION, REPO };