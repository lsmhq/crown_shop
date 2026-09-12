async function api(path, opts) {
  const o = opts || {};
  const res = await fetch(path, {
    method: o.method || 'GET',
    headers: o.body ? { 'Content-Type': 'application/json' } : {},
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
  });
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (res.redirected) {
    window.location.reload();
    return null;
  }
  if (ct.includes('application/json')) {
    const data = await res.json();
    if (!res.ok || data.error) {
      const err = new Error(data.error || ('请求失败 (' + res.status + ')'));
      err.status = res.status;
      throw err;
    }
    return data;
  }
  if (!res.ok) throw new Error('请求失败 (' + res.status + ')');
  return res;
}

async function download(path, fallbackName, params) {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  try {
    const res = await fetch(path + q);
    if (!res.ok) throw new Error('下载失败 (' + res.status + ')');
    const blob = await res.blob();
    let name = fallbackName;
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="([^"]+)"/i);
    if (m) {
      try { name = decodeURIComponent(m[1]); } catch (e) { name = m[1]; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const res = fr.result;
      const b64 = typeof res === 'string' ? res.split(',')[1] : '';
      resolve(b64);
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}