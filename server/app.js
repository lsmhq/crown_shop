
  var http = require("http");
  var url = require("url");
  var fs = require("fs");
  var path = require("path");
  var { spawn } = require("child_process");
  var P = require('./path');
  var { log } = require('./log');
  var db = require('./db');
  var exporter = require('./export');
  var stats = require('./stats');
  var rate = require('./rate');
  var util = require('./util');
  var update = require('./update');
  var MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".map": "application/json"
  };
  function json(res, data, status) {
    const code = status || 200;
    const buf = Buffer.from(JSON.stringify(data));
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": buf.length
    });
    res.end(buf);
  }
  function sendFile(res, buffer, filename, mime) {
    const name = encodeURIComponent(filename);
    res.writeHead(200, {
      "Content-Type": mime || "application/octet-stream",
      "Content-Length": buffer.length,
      "Content-Disposition": 'attachment; filename="' + name + `"; filename*=UTF-8''` + name
    });
    res.end(buffer);
  }
  function wrap(fn) {
    return async (res, p, u, body) => {
      try {
        await fn(res, p, u, body);
      } catch (e) {
        log("接口错误: " + p + " -> " + (e && e.stack ? e.stack : e.message), "error");
        json(res, { error: e.message }, 400);
      }
    };
  }
  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size > 60 * 1024 * 1024) {
          reject(new Error("请求体过大"));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }
  function normalizeBody(body) {
    return body && typeof body === "object" ? body : {};
  }
  function rangeOf(p) {
    return util.parseRange(p.query.from || "7d", p.query.to || "");
  }
  function supplierList(d) {
    const list = d.suppliers.map((s) => ({ id: s.id, name: s.name, createdAt: s.createdAt }));
    const names = new Set(list.map((s) => s.name));
    for (const p of d.products) {
      const n = String(p.supplierName || "").trim();
      if (n && n !== "未指定货源" && !names.has(n)) {
        list.push({ id: "", name: n, createdAt: "" });
        names.add(n);
      }
    }
    return list;
  }
  function ensureSupplier(d, name) {
    const n = String(name || "").trim();
    if (!n || n === "未指定货源") return;
    if (d.suppliers.some((s) => s.name === n)) return;
    d.suppliers.push({ id: db.genId("t"), name: n, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
  const SPEC_LABELS = ["2.5k", "5k", "13.75k", "30k", "60k", "80k"];

  var api = {
    bootstrap(res) {
      const d = db.get();
      json(res, { settings: d.settings, products: d.products, orders: d.orders, suppliers: supplierList(d) });
    },
    async putSettings(res, p, u, body) {
      const s = db.get().settings;
      const b = normalizeBody(body);
      if (typeof b.shopName === "string" && b.shopName.trim()) s.shopName = b.shopName.trim();
      if (b.autoBackupDays !== void 0) s.autoBackupDays = Math.max(0, Number(b.autoBackupDays) || 1);
      if (b.usdCnyRate !== void 0 && b.usdCnyRate !== "" && !isNaN(Number(b.usdCnyRate))) {
        s.usdCnyRate = Number(b.usdCnyRate);
        s.rateUpdatedAt = s.rateUpdatedAt || (/* @__PURE__ */ new Date()).toISOString();
        s.rateSource = "manual";
      }
      db.save();
      json(res, { ok: true, settings: s });
    },
    // ---- 货源 ----
    listSuppliers(res) {
      json(res, supplierList(db.get()));
    },
    addSupplier(res, p, u, body) {
      const d = db.get();
      const b = normalizeBody(body);
      const name = String(b.name || "").trim();
      if (!name) return json(res, { error: "供货人名称不能为空" }, 400);
      if (supplierList(d).some((s2) => s2.name === name)) return json(res, { error: "该供货人已存在" }, 400);
      const s = { id: db.genId("t"), name, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      d.suppliers.push(s);
      db.save();
      json(res, { ok: true, id: s.id });
    },
    renameSupplier(res, p, u, body) {
      const d = db.get();
      const id = p.params[0];
      const s = d.suppliers.find((x) => x.id === id);
      if (!s) return json(res, { error: "供货人不存在" }, 404);
      const b = normalizeBody(body);
      const name = String(b.name || "").trim();
      if (!name) return json(res, { error: "供货人名称不能为空" }, 400);
      if (supplierList(d).some((x) => x.name === name && x.id !== id)) return json(res, { error: "该供货人已存在" }, 400);
      for (const prod of d.products) {
        if (prod.supplierName === s.name) prod.supplierName = name;
      }
      s.name = name;
      db.save();
      json(res, { ok: true });
    },
    deleteSupplier(res, p) {
      const d = db.get();
      const id = p.params[0];
      const i = d.suppliers.findIndex((x) => x.id === id);
      if (i < 0) return json(res, { error: "供货人不存在" }, 404);
      const name = d.suppliers[i].name;
      const used = d.products.filter((x) => x.supplierName === name);
      if (used.length) return json(res, { error: "该供货人下还有 " + used.length + " 件商品，请先删除或转移后再删除" }, 400);
      d.suppliers.splice(i, 1);
      db.save();
      json(res, { ok: true });
    },
    // ---- 商品 ----
    listProducts(res, p, u) {
      let list = db.get().products.slice();
      const q = p.query;
      if (q.status && q.status !== "all") list = list.filter((x) => x.status === q.status);
      if (q.supplierId) list = list.filter((x) => x.supplierId === q.supplierId);
      if (q.supplier) list = list.filter((x) => (x.supplierName || "") === q.supplier);
      if (q.spec === "__none__") list = list.filter((x) => !(x.spec || ""));
      else if (q.spec) list = list.filter((x) => (x.spec || "") === q.spec);
      if (q.keyword) {
        const kw = String(q.keyword).toLowerCase();
        list = list.filter(
          (x) => x.code.toLowerCase().includes(kw) || (x.supplierName || "").toLowerCase().includes(kw) || (x.customerName || "").toLowerCase().includes(kw) || (x.note || "").toLowerCase().includes(kw)
        );
      }
      list.sort((a, b) => (b.purchaseAt || "").localeCompare(a.purchaseAt || ""));
      json(res, list);
    },
    addProduct(res, p, u, body) {
      const d = db.get();
      const b = normalizeBody(body);
      const code = String(b.code || "").trim();
      if (!code) return json(res, { error: "皇冠码不能为空" }, 400);
      if (d.products.some((x) => x.code === code)) return json(res, { error: "皇冠码 " + code + " 已存在" }, 400);
      const cost = Number(b.cost);
      const price = b.price === void 0 || b.price === null || b.price === "" ? null : Number(b.price);
      if (isNaN(cost)) return json(res, { error: "成本不正确" }, 400);
      if (price !== null && isNaN(price)) return json(res, { error: "售价格式不正确" }, 400);
      const supName = String(b.supplierName || "").trim();
      if (!supName) return json(res, { error: "请选择供货人" }, 400);
      const spec = SPEC_LABELS.includes(b.spec) ? b.spec : "";
      const proc = {
        id: db.genId("p"),
        code,
        cost,
        price,
        spec,
        supplierId: "",
        supplierName: supName,
        status: "instock",
        customerId: "",
        customerName: "",
        purchaseAt: util.toISO(util.parseISO(b.purchaseAt) || /* @__PURE__ */ new Date()),
        soldAt: "",
        orderId: "",
        sellerName: "",
        note: String(b.note || "").trim(),
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      d.products.push(proc);
      ensureSupplier(d, proc.supplierName);
      db.save();
      json(res, { ok: true, id: proc.id, code: proc.code });
    },
    bulkEntry(res, p, u, body) {
      const d = db.get();
      const b = normalizeBody(body);
      const codes = Array.isArray(b.codes) ? b.codes.map((c) => String(c || "").trim()).filter(Boolean) : [];
      if (!codes.length) return json(res, { error: "请填写皇冠码（每行一个）" }, 400);
      if (codes.length > 5e3) return json(res, { error: "单次批量入库最多 5000 个皇冠码" }, 400);
      const dup = codes.find((c, i) => codes.indexOf(c) !== i);
      if (dup) return json(res, { error: "皇冠码 " + dup + " 在本批中重复" }, 400);
      const existing = codes.filter((c) => d.products.some((x) => x.code === c));
      if (existing.length) return json(res, { error: "皇冠码 " + existing.join("、") + " 已存在" }, 400);
      const cost = Number(b.cost);
      const price = b.price === void 0 || b.price === null || b.price === "" ? null : Number(b.price);
      if (isNaN(cost)) return json(res, { error: "成本不正确" }, 400);
      if (price !== null && isNaN(price)) return json(res, { error: "售价格式不正确" }, 400);
      const supName = String(b.supplierName || "").trim();
      if (!supName) return json(res, { error: "请选择供货人" }, 400);
      const purchaseAt = util.toISO(util.parseISO(b.purchaseAt) || /* @__PURE__ */ new Date());
      const note = String(b.note || "").trim();
      const spec = SPEC_LABELS.includes(b.spec) ? b.spec : "";
      const prods = codes.map((code) => ({
        id: db.genId("p"),
        code,
        cost,
        price,
        spec,
        supplierId: "",
        supplierName: supName,
        status: "instock",
        customerId: "",
        customerName: "",
        purchaseAt,
        soldAt: "",
        orderId: "",
        sellerName: "",
        note,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }));
      d.products.push(...prods);
      ensureSupplier(d, supName);
      db.save();
      log("批量入库: " + supName + " x" + prods.length);
      json(res, { ok: true, count: prods.length });
    },
    updateProduct(res, p, u, body) {
      const d = db.get();
      const id = p.params[0];
      const prod = d.products.find((x) => x.id === id);
      if (!prod) return json(res, { error: "商品不存在" }, 404);
      const b = normalizeBody(body);
      const code = String(b.code !== void 0 ? b.code : prod.code).trim();
      if (!code) return json(res, { error: "皇冠码不能为空" }, 400);
      if (code !== prod.code && d.products.some((x) => x.code === code)) return json(res, { error: "皇冠码 " + code + " 已存在" }, 400);
      if (prod.status === "sold") {
        const locked = ["cost", "price", "supplierId", "supplierName", "supplier"];
        for (const f of Object.keys(b)) {
          if (locked.includes(f)) return json(res, { error: "已售出的商品不能修改成本/售价/货源，请先退货" }, 400);
        }
      }
      prod.code = code;
      if (prod.status === "instock") {
        const cost = Number(b.cost);
        if (isNaN(cost)) return json(res, { error: "成本格式不正确" }, 400);
        prod.cost = cost;
        const price = b.price === void 0 || b.price === null || b.price === "" ? prod.price : Number(b.price);
        if (price !== null && isNaN(price)) return json(res, { error: "售价格式不正确" }, 400);
        prod.price = price;
        if (b.supplierName !== void 0) {
          prod.supplierName = String(b.supplierName).trim() || "未指定货源";
          ensureSupplier(d, prod.supplierName);
        }
      }
      if (b.spec !== void 0) prod.spec = SPEC_LABELS.includes(b.spec) ? b.spec : "";
      prod.note = String(b.note || "").trim();
      db.save();
      json(res, { ok: true });
    },
    deleteProduct(res, p) {
      const d = db.get();
      const id = p.params[0];
      const prod = d.products.find((x) => x.id === id);
      if (!prod) return json(res, { error: "商品不存在" }, 404);
      if (prod.status !== "instock") return json(res, { error: "仅“在库”商品可删除，已售/退货商品请先处理" }, 400);
      const i = d.products.findIndex((x) => x.id === id);
      d.products.splice(i, 1);
      db.save();
      json(res, { ok: true });
    },
    batchDeleteProducts(res, p, u, body) {
      const d = db.get();
      const b = normalizeBody(body);
      const ids = Array.isArray(b.ids) ? b.ids.slice() : [];
      if (!ids.length) return json(res, { error: "请选择要删除的商品" }, 400);
      let deleted = 0;
      let skipped = 0;
      for (const id of ids) {
        const idx = d.products.findIndex((x) => x.id === id);
        if (idx < 0) continue;
        if (d.products[idx].status !== "instock") { skipped++; continue; }
        d.products.splice(idx, 1);
        deleted++;
      }
      db.save();
      json(res, { ok: true, deleted, skipped });
    },
    returnProduct(res, p, u, body) {
      const d = db.get();
      const b = normalizeBody(body);
      const prod = d.products.find((x) => x.id === b.id);
      if (!prod) return json(res, { error: "商品不存在" }, 404);
      if (prod.status !== "sold") return json(res, { error: "该商品不是已售出状态" }, 400);
      doReturnProduct(prod);
      refreshOrderStatus(prod.orderId);
      db.save();
      json(res, { ok: true });
    },
    // ---- 订单 ----
    listOrders(res, p, u) {
      let list = db.get().orders.slice();
      const q = p.query;
      const { start: start2, end } = rangeOf(p);
      if (q.from || q.to) {
        const s = start2.getTime();
        const e = end.getTime();
        list = list.filter((o) => {
          const t = new Date(o.createdAt).getTime();
          return t >= s && t <= e;
        });
      }
      if (q.status && q.status !== "all") list = list.filter((o) => o.status === q.status);
      if (q.keyword) {
        const kw = String(q.keyword).toLowerCase();
        list = list.filter(
          (o) => (o.no || "").toLowerCase().includes(kw) || (o.customerName || "").toLowerCase().includes(kw) || (o.items || []).some((it) => (it.code || "").toLowerCase().includes(kw))
        );
      }
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      json(res, list);
    },
    getOrder(res, p) {
      const o = db.get().orders.find((x) => x.id === p.params[0]);
      if (!o) return json(res, { error: "订单不存在" }, 404);
      json(res, o);
    },
    createSale(res, p, u, body) {
      const d = db.get();
      const b = normalizeBody(body);
      const itemsIn = Array.isArray(b.items) && b.items.length ? b.items : Array.isArray(b.productIds) ? b.productIds.map((id) => ({ id })) : [];
      if (!itemsIn.length) return json(res, { error: "请选择要出售的商品" }, 400);
      const pairs = itemsIn.map((it) => ({ prod: d.products.find((x) => x.id === (it.id || it.productId)), price: it.price }));
      if (pairs.some((x) => !x.prod)) return json(res, { error: "存在无效商品" }, 400);
      const bad = pairs.filter((x) => x.prod.status !== "instock");
      if (bad.length) return json(res, { error: "商品 " + bad.map((x) => x.prod.code).join("、") + " 不在库（可能已售出）" }, 400);
      const priced = pairs.map((x) => {
        if (x.price === void 0 || x.price === null || x.price === "") return null;
        const price = Number(x.price);
        return isNaN(price) ? null : price;
      });
      if (priced.some((x) => x === null)) return json(res, { error: "请为每件商品填写售价" }, 400);
      const buyer = String(b.buyer || "").trim() || "散客";
      const seller = "";
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const saleRate = rate.current();
      let total = 0;
      let profit = 0;
      const items = pairs.map((x, idx) => {
        const prod = x.prod;
        const price = priced[idx];
        const costCny = Number(prod.cost) || 0;
        const costUsd = rate.costToUsd(costCny, saleRate);
        total += price;
        profit += price - costUsd;
        return {
          productId: prod.id,
          code: prod.code,
          spec: prod.spec || "",
          cost: costCny,
          price,
          costUsd,
          rate: saleRate,
          supplierId: prod.supplierId,
          supplierName: prod.supplierName
        };
      });
      const order = {
        id: db.genId("o"),
        no: db.nextOrderNo(),
        customerId: "",
        customerName: buyer,
        customerPhone: "",
        seller,
        createdAt: now,
        total: util.money(total),
        profit: util.money(profit),
        rate: saleRate,
        status: "normal",
        note: String(b.note || "").trim(),
        items,
        returnedItems: []
      };
      d.orders.push(order);
      pairs.forEach((x, idx) => {
        const prod = x.prod;
        prod.status = "sold";
        prod.soldAt = now;
        prod.price = priced[idx];
        prod.customerId = "";
        prod.customerName = buyer;
        prod.orderId = order.id;
        prod.sellerName = seller;
        prod.saleRate = saleRate;
      });
      db.save();
      log("销售出单: " + order.no + " 共" + pairs.length + "件 / $" + order.total);
      json(res, { ok: true, order });
    },
    returnAll(res, p) {
      const d = db.get();
      const o = d.orders.find((x) => x.id === p.params[0]);
      if (!o) return json(res, { error: "订单不存在" }, 404);
      for (const it of o.items || []) {
        const prod = d.products.find((x) => x.id === it.productId);
        if (prod && prod.status === "sold" && prod.orderId === o.id) doReturnProduct(prod);
      }
      o.status = "returned";
      db.save();
      log("整单退货: " + o.no);
      json(res, { ok: true });
    },
    returnItems(res, p, u, body) {
      const d = db.get();
      const o = d.orders.find((x) => x.id === p.params[0]);
      if (!o) return json(res, { error: "订单不存在" }, 404);
      const b = normalizeBody(body);
      const ids = Array.isArray(b.productIds) ? b.productIds : [];
      if (!ids.length) return json(res, { error: "请选择要退货的商品" }, 400);
      for (const id of ids) {
        const prod = d.products.find((x) => x.id === id);
        if (!prod || !(o.items || []).some((it) => it.productId === id)) {
          return json(res, { error: "存在不属于该订单的商品" }, 400);
        }
        if (prod.status === "sold" && prod.orderId === o.id) doReturnProduct(prod);
      }
      refreshOrderStatus(o.id);
      db.save();
      json(res, { ok: true });
    },
    // ---- 导出 ----
    exportProducts(res, p, u) {
      const buf = exporter.exportProductsBuffer(p.query);
      const st = /* @__PURE__ */ new Date();
      sendFile(res, buf, "商品列表-" + util.fmtDate(st) + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    },
    exportOrders(res, p, u) {
      const { start: start2, end } = rangeOf(p);
      const buf = exporter.exportOrdersBuffer(start2, end);
      sendFile(res, buf, "订单列表-" + util.fmtDate(/* @__PURE__ */ new Date()) + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    },
    exportSupplierProfit(res, p, u) {
      const { start: start2, end } = rangeOf(p);
      const buf = exporter.exportSupplierProfitBuffer(start2, end);
      sendFile(res, buf, "货源分成报表-" + util.fmtDate(start2) + "_" + util.fmtDate(end) + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    },
    // ---- 皇冠码解析（供整批入库用）----
    parseProductCodes(res, p, u, body) {
      const b = normalizeBody(body);
      const XLSX = require_xlsx();
      const codes = [];
      const CODE_HEADER = /^(编号|编码|商品编号|商品编码|货源编号|sku|code|皇冠码)$/i;
      if (b.type === "xlsx" && b.base64) {
        try {
          const wb = XLSX.read(Buffer.from(b.base64, "base64"), { type: "buffer" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
          let headerCol = -1;
          let headerRow = -1;
          const scanMax = Math.min(rows.length, 3);
          for (let r = 0; r < scanMax && headerCol < 0; r++) {
            const row = rows[r] || [];
            for (let c = 0; c < row.length; c++) {
              if (CODE_HEADER.test(String(row[c]).trim())) {
                headerCol = c;
                headerRow = r;
                break;
              }
            }
          }
          if (headerCol >= 0) {
            for (let r = headerRow + 1; r < rows.length; r++) {
              const cell = String(rows[r] && rows[r][headerCol] !== void 0 ? rows[r][headerCol] : "").trim();
              if (cell) codes.push(cell);
            }
          } else {
            for (const row of rows) {
              if (!row) continue;
              for (const v of row) {
                const cell = String(v === void 0 || v === null ? "" : v).trim();
                if (cell) codes.push(cell);
              }
            }
          }
        } catch (e) {
          return json(res, { error: "Excel 解析失败: " + e.message }, 400);
        }
      } else if (b.content || b.text) {
        const lines = String(b.content || b.text).split(/\r?\n/);
        let skippedHeader = false;
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          if (!skippedHeader && CODE_HEADER.test(line)) {
            skippedHeader = true;
            continue;
          }
          codes.push(line);
        }
      }
      if (!codes.length) return json(res, { codes: [], error: "未解析到任何皇冠码" });
      const seen = /* @__PURE__ */ new Set();
      const unique = [];
      for (const c of codes) {
        if (!seen.has(c)) {
          seen.add(c);
          unique.push(c);
        }
      }
      const duplicates = codes.length - unique.length;
      const inDb = unique.filter((c) => db.get().products.some((x) => x.code === c));
      const inDbSet = new Set(inDb);
      const valid = unique.filter((c) => !inDbSet.has(c));
      const msgParts = [];
      if (duplicates) msgParts.push(duplicates + " 个重复皇冠码");
      if (inDb.length) msgParts.push(inDb.length + " 个已存在于数据库");
      json(res, { codes: valid, total: valid.length, skipped: duplicates, duplicates: inDb.length, inDb, message: msgParts.join("，") });
    },
    // ---- 统计 ----
    statsOverview(res) {
      json(res, stats.overview());
    },
    statsTimeline(res, p, u) {
      const { start: start2, end } = rangeOf(p);
      json(res, stats.timeline(start2, end, p.query.groupBy || "day"));
    },
    statsSuppliers(res, p, u) {
      const { start: start2, end } = rangeOf(p);
      json(res, stats.supplierStats(start2, end));
    },
    statsSpecs(res, p, u) {
      const { start: start2, end } = rangeOf(p);
      const cov = Number(p.query.coverage) > 0 ? Number(p.query.coverage) : 14;
      json(res, stats.specStats(start2, end, cov));
    },
    // ---- 汇率 ----
    getRate(res) {
      const s = db.get().settings;
      json(res, { rate: rate.current(), updatedAt: s.rateUpdatedAt || "", source: s.rateSource || "cache", defaultRate: rate.DEFAULT_RATE });
    },
    async refreshRate(res) {
      try {
        const r = await rate.refresh();
        json(res, { ok: true, ...r });
      } catch (e) {
        json(res, { error: "汇率刷新失败: " + e.message }, 500);
      }
    },
    // ---- 系统 ----
    sysBackup(res, p, u, body) {
      const b = normalizeBody(body);
      const name = db.backup(b.label);
      json(res, { ok: true, file: name });
    },
    sysBackups(res) {
      json(res, db.listBackups());
    },
    sysRestore(res, p, u, body) {
      const b = normalizeBody(body);
      try {
        db.restore(String(b.file || ""));
        json(res, { ok: true });
      } catch (e) {
        json(res, { error: e.message }, 400);
      }
    },
    sysShutdown(res) {
      log("收到退出指令，服务即将关闭");
      json(res, { ok: true }, 200);
      setTimeout(() => {
        try {
          process.exit(0);
        } catch (e) {
        }
      }, 300);
    },
    updateCheck(res, p, u) {
      update.check().then((r) => json(res, r)).catch((e) => json(res, { error: "检查更新失败：" + e.message }, 502));
    },
    updateApply(res, p, u) {
      update.check().then(async (r) => {
        if (!r.latest || !r.hasUpdate) return json(res, { current: r.current, message: "已是最新版本" });
        const prepared = update.prepare(r.latest);
        const launched = prepared.then((pre) => update.launchUpdater(pre));
        const info = await launched;
        json(res, { ok: true, version: info.ver, message: "更新已下载，程序将自动重启完成更新" });
        setTimeout(() => {
          try {
            process.exit(0);
          } catch (e) {
          }
        }, 6000);
      }).catch((e) => json(res, { error: e.message }, 500));
    }
  };
  function doReturnProduct(prod) {
    prod.status = "instock";
    prod.soldAt = "";
    prod.customerId = "";
    prod.customerName = "";
    prod.orderId = "";
    prod.sellerName = "";
  }
  function refreshOrderStatus(orderId) {
    const d = db.get();
    const o = d.orders.find((x) => x.id === orderId);
    if (!o || o.status === "returned") return;
    const rem = (o.items || []).filter((it) => {
      const prod = d.products.find((x) => x.id === it.productId);
      return prod && prod.status === "sold" && prod.orderId === o.id;
    });
    o.status = rem.length ? rem.length < o.items.length ? "partial" : "normal" : "returned";
    if (o.status === "returned") o.returnedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  var getPatterns = [
    [/^\/api\/bootstrap$/, api.bootstrap],
    [/^\/api\/products$/, api.listProducts],
    [/^\/api\/suppliers$/, api.listSuppliers],
    [/^\/api\/orders$/, api.listOrders],
    [/^\/api\/orders\/([^/]+)$/, api.getOrder],
    [/^\/api\/export\/products\.xlsx$/, api.exportProducts],
    [/^\/api\/export\/orders\.xlsx$/, api.exportOrders],
    [/^\/api\/export\/supplier\-profit\.xlsx$/, api.exportSupplierProfit],
    [/^\/api\/stats\/overview$/, api.statsOverview],
    [/^\/api\/stats\/timeline$/, api.statsTimeline],
    [/^\/api\/stats\/suppliers$/, api.statsSuppliers],
    [/^\/api\/stats\/specs$/, api.statsSpecs],
    [/^\/api\/rate$/, api.getRate],
    [/^\/api\/system\/backups$/, api.sysBackups],
    [/^\/api\/update\/check$/, api.updateCheck]
  ];
  var postPatterns = [
    [/^\/api\/suppliers$/, api.addSupplier],
    [/^\/api\/products$/, api.addProduct],
    [/^\/api\/products\/batch\-delete$/, api.batchDeleteProducts],
    [/^\/api\/products\/bulk\-entry$/, api.bulkEntry],
    [/^\/api\/products\/return$/, api.returnProduct],
    [/^\/api\/products\/parse\-codes$/, api.parseProductCodes],
    [/^\/api\/sales$/, api.createSale],
    [/^\/api\/orders\/([^/]+)\/return\-all$/, api.returnAll],
    [/^\/api\/orders\/([^/]+)\/return\-items$/, api.returnItems],
    [/^\/api\/rate\/refresh$/, api.refreshRate],
    [/^\/api\/system\/backup$/, api.sysBackup],
    [/^\/api\/system\/restore$/, api.sysRestore],
    [/^\/api\/system\/shutdown$/, api.sysShutdown],
    [/^\/api\/update\/apply$/, api.updateApply]
  ];
  var putPatterns = [
    [/^\/api\/settings$/, api.putSettings],
    [/^\/api\/suppliers\/([^/]+)$/, api.renameSupplier],
    [/^\/api\/products\/([^/]+)$/, api.updateProduct]
  ];
  var delPatterns = [
    [/^\/api\/suppliers\/([^/]+)$/, api.deleteSupplier],
    [/^\/api\/products\/([^/]+)$/, api.deleteProduct]
  ];
  function serveStatic(res, p) {
    let rel = decodeURIComponent(p);
    if (rel === "/" || rel === "") rel = "/index.html";
    if (rel.includes("..")) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const fp = path.join(P.publicDir, rel);
    if (!fp.startsWith(P.publicDir)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(fp, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("页面不存在");
        return;
      }
      const ext = path.extname(fp).toLowerCase();
      const isText = [".html", ".js", ".css", ".json"].includes(ext);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": isText ? "no-cache" : "public, max-age=86400" });
      res.end(data);
    });
  }
  async function handle(req, res) {
    const u = url.parse(req.url, true);
    const p = u.pathname;
    const method = req.method;
    if (p.startsWith("/api/")) {
      const patterns = method === "GET" ? getPatterns : method === "POST" ? postPatterns : method === "PUT" ? putPatterns : method === "DELETE" ? delPatterns : [];
      let body = {};
      if (method === "POST" || method === "PUT") {
        try {
          const raw = (await readBody(req)).toString("utf8");
          body = raw ? JSON.parse(raw) : {};
        } catch (e) {
          return json(res, { error: "请求数据解析失败: " + e.message }, 400);
        }
      }
      for (const [re, fn] of patterns) {
        const m = p.match(re);
        if (m) {
          u.params = m.slice(1);
          return wrap(fn)(res, u, p, body);
        }
      }
      return json(res, { error: "接口不存在: " + method + " " + p }, 404);
    }
    return serveStatic(res, p);
  }
  function start(port2) {
    db.load();
    db.autoBackupCheck();
    const server = http.createServer(handle);
    const base = port2 || 8765;
    function listen(attempt) {
      const prt = base + (attempt || 0);
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && (attempt || 0) < 10) {
          log("端口 " + prt + " 被占用，尝试 " + (prt + 1));
          listen((attempt || 0) + 1);
        } else {
          log("服务启动失败: " + err.message, "error");
          process.exit(1);
        }
      });
      server.listen(prt, "127.0.0.1", () => {
        log("服务已启动: http://127.0.0.1:" + prt + "/");
        openBrowser("http://127.0.0.1:" + prt + "/");
        rate.refresh().catch(() => {
        });
        setInterval(() => {
          rate.refresh().catch(() => {
          });
        }, 6 * 60 * 60 * 1e3).unref();
      });
    }
    listen(0);
    return server;
  }
  function openBrowser(target) {
    try {
      if (process.platform === "win32") {
        spawn("cmd", ["/c", "start", "", target], { windowsHide: true, detached: true }).unref();
      } else if (process.platform === "darwin") {
        spawn("open", [target], { detached: true }).unref();
      } else {
        spawn("xdg-open", [target], { detached: true }).unref();
      }
    } catch (e) {
      log("打开浏览器失败: " + e.message, "warn");
    }
  }
  process.on("uncaughtException", (e) => {
    log("未捕获异常: " + e.stack, "error");
  });
  process.on("SIGINT", () => {
    log("收到 Ctrl+C，退出");
    process.exit(0);
  });
  module.exports = { start, handle };

