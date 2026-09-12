// server/rate.js - 美元/人民币实时汇率（自动获取，离线时用缓存/手动值）
const https = require('https');
const db = require('./db');
const { log } = require('./log');

const API_URL = 'https://open.er-api.com/v6/latest/USD';
const DEFAULT_RATE = 7.0;

function current() {
  const r = Number(db.get().settings.usdCnyRate);
  return isNaN(r) || r <= 0 ? DEFAULT_RATE : r;
}

function settings() {
  return db.get().settings;
}

function refresh() {
  return new Promise((resolve) => {
    const req = https.get(API_URL, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const cny = Number(j && j.rates && j.rates.CNY);
          if (cny && cny > 0) {
            const d = db.get();
            d.settings.usdCnyRate = cny;
            d.settings.rateUpdatedAt = new Date().toISOString();
            d.settings.rateSource = 'auto';
            db.save();
            log('实时汇率已更新: $1 = ¥' + cny);
            resolve({ rate: cny, updatedAt: d.settings.rateUpdatedAt, source: 'auto' });
            return;
          }
          throw new Error('接口返回缺少CNY');
        } catch (e) {
          log('获取汇率失败: ' + e.message, 'warn');
          resolve({ rate: current(), updatedAt: settings().rateUpdatedAt || '', source: 'cache' });
        }
      });
    });
    req.setTimeout(10000, () => {
      req.destroy();
      log('获取汇率超时，使用缓存汇率', 'warn');
      resolve({ rate: current(), updatedAt: settings().rateUpdatedAt || '', source: 'cache' });
    });
    req.on('error', (e) => {
      log('获取汇率失败: ' + e.message, 'warn');
      resolve({ rate: current(), updatedAt: settings().rateUpdatedAt || '', source: 'cache' });
    });
  });
}

// 将人民币成本折算成美元（成本÷汇率）
function costToUsd(cost, rate) {
  const n = Number(cost) || 0;
  const r = rate && Number(rate) > 0 ? Number(rate) : current();
  return n / r;
}

module.exports = { current, refresh, costToUsd, DEFAULT_RATE };