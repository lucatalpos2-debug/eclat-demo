/* Éclat · panoul în modul DEMO (doar pentru demo-ul de pe GitHub Pages).
   Înlocuiește serverul cu date de exemplu ținute în browser (localStorage): clienta poate apăsa pe orice,
   iar ce modifică rămâne doar la ea. Se încarcă înainte de admin.js; catalogul vine din demo-data.js. */
(() => {
  "use strict";
  const SEED = window.ECLAT_DEMO_SEED;
  const KEY = "eclat-demo-panel-v1";
  const TZ = "Europe/Bucharest";
  const pad = (n) => String(n).padStart(2, "0");
  const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const parseTime = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? +m[1] * 60 + +m[2] : null; };
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dow = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
  const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const str = (v, max) => String(v ?? "").trim().slice(0, max);
  const normPhone = (v) => { let d = String(v ?? "").replace(/\D/g, ""); if (d.startsWith("0040")) d = "0" + d.slice(4); else if (d.startsWith("40") && d.length === 11) d = "0" + d.slice(2); return d; };
  const phoneValid = (p) => /^0[237]\d{8}$/.test(p);
  const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
  function nowRO() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour % 24) * 60 + +p.minute };
  }
  const durLabel = (min) => { const h = Math.floor(min / 60), m = min % 60; return !h ? `${m} min` : m ? `${h}h ${m}` : `${h}h`; };
  const priceLabel = (s) => `${s.price_min === s.price_max ? s.price_min : `${s.price_min}–${s.price_max}`} lei${s.per_nail ? " / unghie" : ""}`;
  const fullName = (s) => (!s.detail ? s.name : s.detail.startsWith("+") ? `${s.name} ${s.detail}` : `${s.name} (${s.detail})`);

  /* ---------------------------- Datele de exemplu ---------------------------- */
  const CLIENTS = [
    ["Ioana Pop", 1], ["Alexandra Rus", 1], ["Bianca Moldovan", 1], ["Diana Sabău", 1], ["Elena Mureșan", 0], ["Raluca Pintea", 1],
    ["Teodora Bud", 1], ["Simona Ilieș", 1], ["Oana Rus", 1], ["Maria Dragomir", 0], ["Cristina Pop", 1], ["Gabriela Vlad", 1],
    ["Larisa Coman", 0], ["Andreea Cârlig", 1], ["Roxana Tămaș", 1], ["Iulia Marinescu", 0], ["Carmen Bota", 1], ["Adina Pașca", 1],
    ["Monica Rusu", 1], ["Paula Bîrlea", 0], ["Ana Chiș", 1], ["Lavinia Ardelean", 1], ["Sorina Hossu", 1], ["Delia Cosma", 0],
  ];
  // [zi față de azi, specialistă, serviciu, ora, clienta (index), online, status]
  const DAY = [
    ["andra-ro", "semi", "08:00", 0], ["andra-ro", "constr", "10:00", 9, 1], ["andra-ro", "intre", "14:30", 1],
    ["laura", "slim", "08:30", 2], ["laura", "semi", "11:00", 10, 1], ["laura", "constr", "15:00", 3],
    ["sonia", "intre", "09:00", 4], ["sonia", "semi", "12:00", 11, 1],
    ["denisa", "pedi-est", "10:30", 5], ["denisa", "semi", "13:30", 6],
    ["andra-ra", "complexa", "09:30", 7], ["andra-ra", "incarnata", "11:30", 12, 1], ["andra-ra", "talpi", "16:00", 8],
  ];
  const OTHER = [ // zile vecine, ca să fie ce vedea în banda cu zile și în lista de programări
    [-1, "andra-ro", "semi", "09:00", 13, 0, "done"], [-1, "laura", "intre", "10:00", 14, 0, "done"], [-1, "sonia", "constr", "12:00", 15, 1, "done"],
    [-1, "denisa", "semi", "14:00", 16, 0, "no_show"], [-1, "andra-ra", "pedi-est", "11:00", 17, 0, "done"],
    [1, "andra-ro", "slim", "09:00", 18], [1, "laura", "semi", "10:30", 19, 1], [1, "sonia", "intre", "13:00", 20],
    [1, "denisa", "constr", "09:30", 21], [1, "andra-ra", "pedi-talpi", "12:00", 22], [1, "laura", "slim-intre", "15:00", 23, 1],
    [2, "andra-ro", "intre", "11:00", 1], [2, "sonia", "semi", "09:00", 3], [2, "denisa", "pedi-est", "14:00", 7],
    [3, "laura", "constr", "10:00", 5], [3, "andra-ra", "micoza", "13:00", 8],
  ];

  function seedState() {
    const today = nowRO().date;
    const st = {
      seedDate: today, seq: 1, session: null, messages: [],
      categories: SEED.categories.map((c, i) => ({ id: c.id, name: c.name, intro: c.intro, sort: i, active: 1 })),
      services: SEED.services.map((s, i) => ({ id: s.id, cat_id: s.cat, name: s.name, detail: s.detail || "", description: s.desc || "", dur: s.dur,
        dur_label: s.durLabel || "", price_min: s.priceMin, price_max: s.priceMax, per_nail: s.perNail ? 1 : 0, sort: i, active: 1 })),
      staff: SEED.staff.map((p, i) => ({ id: p.id, name: p.name, initials: p.initials, role: p.role, cats: p.cats, rating: p.rating, reviews: p.reviews,
        sort: i, active: 1, account: p.id === "laura" || p.id === "sonia" ? 1 : 0, must_change: 0 })),
      clients: CLIENTS.map(([name, existing], i) => ({ id: i + 1, name, phone: `07${pad(40 + (i % 50))}${String(310000 + i * 7919).slice(-6)}`,
        email: `${slug(name.split(" ")[0])}${i + 1}@example.com`, notes: "", source: existing ? (i % 3 ? "import" : "manual") : "website",
        imported_visits: existing ? 1 + (i % 6) : 0, created_at: today })),
      appointments: [], blocks: [],
    };
    const open = (d) => !!SEED.salon.hours[dow(d)];
    const fits = (d, start, dur) => { const h = SEED.salon.hours[dow(d)]; return h && start >= h[0] && start + dur <= h[1]; };
    const add = (date, staff, svcId, time, ci, online, status = "confirmed") => {
      const s = st.services.find((x) => x.id === svcId), start = parseTime(time);
      if (!s || !open(date) || !fits(date, start, s.dur)) return;
      const c = st.clients[ci], first = c.imported_visits ? 0 : st.appointments.some((a) => a.client_id === c.id) ? 0 : 1;
      st.appointments.push({ id: st.seq++, client_id: c.id, service_id: s.id, service_name: fullName(s), staff_id: staff, date, start_min: start, end_min: start + s.dur,
        price_label: priceLabel(s), price_final: Math.round(s.price_min * (first ? 0.8 : 1)), first_visit: first, discount_pct: first ? 20 : 0,
        status, source: online ? "website" : "manual", notes: "", seen: online && date >= today ? 0 : 1, cancelled_by: "", changed_by: online ? "" : "Administrator" });
    };
    DAY.forEach(([staff, svc, time, ci, online]) => add(today, staff, svc, time, ci, online));
    OTHER.forEach(([off, staff, svc, time, ci, online, status]) => add(addDays(today, off), staff, svc, time, ci, online, status));
    if (open(today)) {
      st.blocks.push({ id: st.seq++, staff_id: "andra-ro", date: today, start_min: 780, end_min: 840, reason: "Pauză de masă" });
      st.blocks.push({ id: st.seq++, staff_id: "sonia", date: today, start_min: 840, end_min: 900, reason: "Pauză de masă" });
    }
    return st;
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { S = null; }
  if (!S || S.seedDate !== nowRO().date) S = seedState(); // în fiecare zi demo-ul pornește proaspăt, cu programări în jurul zilei de azi
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* fără stocare: merge doar până la reîncărcare */ } };
  save();
  window.ECLAT_DEMO_RESET = () => { S = seedState(); save(); location.reload(); };

  /* ---------------------------- Logica (la fel ca serverul) ---------------------------- */
  class E extends Error { constructor(status, code, msg) { super(msg); this.status = status; this.code = code; } }
  const bad = (m) => new E(400, "invalid", m);
  const client = (id) => S.clients.find((c) => c.id === Number(id));
  const staffOne = (id) => S.staff.find((p) => p.id === id);
  const withClient = (a) => { const c = client(a.client_id) || {}; return { ...a, client_name: c.name, phone: c.phone, client_email: c.email }; };
  const sorted = (arr) => [...arr].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const isFirst = (phone) => { const c = S.clients.find((x) => x.phone === phone); return !c || (!c.imported_visits && !S.appointments.some((a) => a.client_id === c.id && a.status !== "cancelled")); };
  const promo = () => nowRO().date <= SEED.salon.promo.until;
  const minutesUntil = (d, s) => { const n = nowRO(); return (Date.parse(d) - Date.parse(n.date)) / 60000 + s - n.minutes; };

  function catalog(own) {
    return {
      categories: sorted(S.categories),
      services: sorted(S.services).map((s) => ({ ...s, label: fullName(s), priceLabel: priceLabel(s), durText: s.dur_label || durLabel(s.dur) })),
      staff: sorted(S.staff).map((p) => ({ ...p, cats: p.cats.split(" ").filter(Boolean), hasAccount: !!p.account,
        calUrl: own == null || own === p.id ? "(linkul personal de calendar apare aici după lansare)" : undefined })),
    };
  }
  function busy(date, excludeId) {
    const map = {};
    const add = (sid, s, e) => (map[sid] ||= []).push([s, e]);
    S.appointments.filter((a) => a.date === date && a.status !== "cancelled" && a.id !== excludeId).forEach((a) => add(a.staff_id, a.start_min, a.end_min));
    S.blocks.filter((b) => b.date === date).forEach((b) => (b.staff_id === "*" ? S.staff.forEach((p) => add(p.id, b.start_min, b.end_min)) : add(b.staff_id, b.start_min, b.end_min)));
    return map;
  }
  function upsertClient({ name, phone, email = "" }, source) {
    const c = S.clients.find((x) => x.phone === phone);
    if (c) { if (email) c.email = email; return c.id; }
    const id = Math.max(0, ...S.clients.map((x) => x.id)) + 1;
    S.clients.push({ id, name, phone, email, notes: "", source, imported_visits: 0, created_at: nowRO().date });
    return id;
  }
  function saveAppt(b, ex, actor) {
    const svc = S.services.find((s) => s.id === str(b.serviceId ?? ex?.service_id, 60)); if (!svc) throw bad("Alege un serviciu.");
    const st = staffOne(str(b.staffId ?? ex?.staff_id, 40)); if (!st) throw bad("Alege specialista.");
    const date = b.date ?? ex?.date; if (!isISO(date)) throw bad("Data nu este validă.");
    const start = b.time != null ? parseTime(b.time) : ex?.start_min; if (start == null) throw bad("Ora nu este validă.");
    const svcChanged = !ex || svc.id !== ex.service_id;
    const dur = b.duration != null ? Math.max(15, Math.min(600, Number(b.duration) | 0)) : svcChanged ? svc.dur : ex.end_min - ex.start_min;
    const end = start + dur;
    if (!b.force && (busy(date, ex?.id)[st.id] || []).some(([s, e]) => start < e && end > s)) throw new E(409, "overlap", `${st.name} are deja ceva programat în acest interval.`);
    if (!ex) {
      let cid;
      if (b.clientId) { if (!client(b.clientId)) throw bad("Clienta nu a fost găsită."); cid = Number(b.clientId); }
      else {
        const name = str(b.client?.name, 80), phone = normPhone(b.client?.phone);
        if (name.length < 2) throw bad("Completează numele clientei."); if (!phoneValid(phone)) throw bad("Numărul de telefon nu pare corect.");
        cid = upsertClient({ name, phone }, "manual");
      }
      const first = promo() && isFirst(client(cid).phone) ? 1 : 0, pct = first ? SEED.salon.promo.percent : 0;
      const a = { id: S.seq++, client_id: cid, service_id: svc.id, service_name: fullName(svc), staff_id: st.id, date, start_min: start, end_min: end,
        price_label: priceLabel(svc), price_final: b.priceFinal != null && b.priceFinal !== "" ? Math.max(0, Number(b.priceFinal) | 0) : Math.round(svc.price_min * (1 - pct / 100)),
        first_visit: first, discount_pct: pct, status: "confirmed", source: "manual", notes: str(b.notes, 600), seen: 1, cancelled_by: "", changed_by: actor };
      S.appointments.push(a);
      return a;
    }
    const status = b.status ?? ex.status;
    if (!["confirmed", "done", "no_show", "cancelled"].includes(status)) throw bad("Status necunoscut.");
    Object.assign(ex, {
      service_id: svc.id, service_name: fullName(svc), staff_id: st.id, date, start_min: start, end_min: end, price_label: priceLabel(svc),
      price_final: b.priceFinal != null && b.priceFinal !== "" ? Math.max(0, Number(b.priceFinal) | 0) : svcChanged ? Math.round(svc.price_min * (1 - ex.discount_pct / 100)) : ex.price_final,
      status, notes: b.notes != null ? str(b.notes, 600) : ex.notes, seen: b.seen != null ? (b.seen ? 1 : 0) : ex.seen,
      cancelled_by: status !== "cancelled" ? "" : ex.status === "cancelled" ? ex.cancelled_by : "salon",
      changed_by: Object.keys(b).every((k) => k === "seen") ? ex.changed_by : actor,
    });
    return ex;
  }
  function listClients(q, limit) {
    const today = nowRO().date, digits = q.replace(/\D/g, "");
    const match = (c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (digits.length >= 3 && c.phone.includes(digits));
    return S.clients.filter(match).sort((a, b) => a.name.localeCompare(b.name, "ro")).slice(0, limit).map((c) => {
      const h = S.appointments.filter((a) => a.client_id === c.id);
      const past = h.filter((a) => ["done", "confirmed"].includes(a.status) && a.date <= today).map((a) => a.date).sort();
      const next = h.filter((a) => a.status === "confirmed" && a.date >= today).map((a) => a.date).sort();
      return { ...c, visits: h.filter((a) => a.status === "done").length, no_shows: h.filter((a) => a.status === "no_show").length,
        last_visit: past.at(-1) || null, next_visit: next[0] || null, spent: h.filter((a) => a.status === "done").reduce((s, a) => s + a.price_final, 0) };
    });
  }
  function stats(date, own) {
    const d = isISO(date) ? date : nowRO().date;
    const mine = (a) => !own || a.staff_id === own;
    const day = S.appointments.filter((a) => a.date === d && a.status !== "cancelled" && mine(a));
    const unseen = S.appointments.filter((a) => !a.seen && (a.status !== "cancelled" || a.cancelled_by === "client") && mine(a)).length;
    const out = { date: d, day: { n: day.length, revenue: day.reduce((s, a) => s + a.price_final, 0), first: day.filter((a) => a.first_visit).length,
      website: day.filter((a) => a.source === "website").length, unseen: day.filter((a) => !a.seen).length }, unseen };
    if (own) delete out.day.revenue;
    return out;
  }
  function move(list, id, dir, scopeFn = () => true) {
    const rows = sorted(list); rows.forEach((r, k) => { r.sort = k; });
    const target = rows.find((r) => r.id === id); if (!target) return;
    const scope = rows.filter((r) => scopeFn(r, target));
    const i = scope.indexOf(target), j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= scope.length) return;
    [scope[i].sort, scope[j].sort] = [scope[j].sort, scope[i].sort];
  }
  const uniq = (list, base) => { let id = slug(base), i = 2; while (list.some((x) => x.id === id)) id = `${slug(base)}-${i++}`; return id; };

  /* ---------------------------- Rutele ---------------------------- */
  function handle(path, method, b = {}) {
    const url = new URL(path, "http://demo"), p = url.pathname, q = url.searchParams;
    const R = (data, status = 200) => ({ status, data });
    if (p === "/api/admin/login-options") return R({ users: sorted(S.staff).filter((x) => x.active && x.account).map((x) => ({ id: x.id, name: x.name })) });
    if (p === "/api/admin/login" && method === "POST") {
      if (!String(b.password || "").length) throw new E(401, "bad_password", "Scrie o parolă (în demo merge orice parolă).");
      const user = str(b.user, 40) || "admin";
      if (user === "admin") S.session = { role: "admin", staffId: "" };
      else { const st = staffOne(user); if (!st || !st.active || !st.account) throw new E(401, "bad_password", "Contul nu există."); S.session = { role: "staff", staffId: st.id }; }
      return R({ ok: true });
    }
    const sess = S.session;
    if (!sess) throw new E(401, "unauthorized", "Autentifică-te din nou.");
    const isAdmin = sess.role === "admin", own = isAdmin ? "" : sess.staffId, me = isAdmin ? null : staffOne(own);
    if (!isAdmin && (!me || !me.active || !me.account)) { S.session = null; throw new E(401, "unauthorized", "Autentifică-te din nou."); }
    const actor = isAdmin ? "Administrator" : me.name;
    const adminOnly = () => { if (!isAdmin) throw new E(403, "forbidden", "Doar administratorul salonului poate face asta."); };
    let m;

    if (p === "/api/admin/logout") { S.session = null; return R({ ok: true }); }
    if (p === "/api/admin/me") return R({ ok: true, today: nowRO(), salon: SEED.salon, user: { role: sess.role, staffId: own, name: actor, mustChange: !!me?.must_change } });
    if (p === "/api/admin/password") { if (isAdmin) throw bad("În demo, parola administratorului nu se schimbă."); if (String(b.next || "").length < 8) throw bad("Parola nouă trebuie să aibă cel puțin 8 caractere."); me.must_change = 0; return R({ ok: true }); }
    if (p === "/api/admin/catalog") return R(catalog(isAdmin ? null : own));
    if (p === "/api/admin/stats") return R(stats(q.get("date"), own));

    if (p === "/api/admin/appointments" && method === "GET") {
      const from = isISO(q.get("from")) ? q.get("from") : nowRO().date, to = isISO(q.get("to")) ? q.get("to") : from;
      const staff = own || q.get("staff") || "", status = q.get("status") || "", text = str(q.get("q"), 60).toLowerCase(), digits = text.replace(/\D/g, "");
      const items = S.appointments.filter((a) => a.date >= from && a.date <= to && (!staff || a.staff_id === staff) && (!status || a.status === status)).map(withClient)
        .filter((a) => !text || a.client_name.toLowerCase().includes(text) || (digits.length >= 3 && a.phone.includes(digits)))
        .sort((x, y) => x.date.localeCompare(y.date) || x.start_min - y.start_min);
      return R({ items });
    }
    if (p === "/api/admin/appointments" && method === "POST") { if (!isAdmin) b.staffId = own; return R(withClient(saveAppt(b, null, actor)), 201); }
    if ((m = /^\/api\/admin\/appointments\/(\d+)$/.exec(p)) && method === "PATCH") {
      const ex = S.appointments.find((a) => a.id === Number(m[1])); if (!ex) throw new E(404, "not_found", "Programarea nu există.");
      if (!isAdmin && ex.staff_id !== own) throw new E(403, "forbidden", "Programarea aparține altei colege.");
      if (!isAdmin && b.staffId != null) b.staffId = own;
      const was = ex.status, saved = withClient(saveAppt(b, ex, actor));
      if (was !== "cancelled" && saved.status === "cancelled" && b.notifyClient && saved.client_email) {
        S.messages.unshift({ id: S.seq++, channel: "email", kind: "anulare-salon", to_addr: saved.client_email, subject: "Programarea ta la Éclat a fost anulată", status: "demo", created_at: new Date().toISOString() });
      }
      return R(saved);
    }

    if (p === "/api/admin/blocks" && method === "GET") {
      const from = q.get("from"), to = q.get("to") || from;
      return R({ items: S.blocks.filter((x) => x.date >= from && x.date <= to && (isAdmin || x.staff_id === own || x.staff_id === "*")).sort((x, y) => x.date.localeCompare(y.date) || x.start_min - y.start_min) });
    }
    if (p === "/api/admin/blocks" && method === "POST") {
      const start = parseTime(b.from), end = parseTime(b.to), staffId = !isAdmin ? own : b.staffId === "*" ? "*" : staffOne(str(b.staffId, 40))?.id;
      if (!staffId) throw bad("Alege persoana."); if (!isISO(b.date) || start == null || end == null || end <= start) throw bad("Verifică data și intervalul.");
      const blk = { id: S.seq++, staff_id: staffId, date: b.date, start_min: start, end_min: end, reason: str(b.reason, 80) };
      S.blocks.push(blk); return R(blk, 201);
    }
    if ((m = /^\/api\/admin\/blocks\/(\d+)$/.exec(p)) && method === "DELETE") {
      const blk = S.blocks.find((x) => x.id === Number(m[1]));
      if (blk && !isAdmin && blk.staff_id !== own) throw new E(403, "forbidden", "Doar administratorul poate șterge acest interval.");
      S.blocks = S.blocks.filter((x) => x.id !== Number(m[1])); return R({ ok: true });
    }

    if (p === "/api/admin/clients" && method === "GET") {
      const text = str(q.get("q"), 60);
      if (isAdmin) return R({ items: listClients(text, Math.min(500, Number(q.get("limit")) || 200)) });
      if (text.replace(/\s/g, "").length < 3) return R({ items: [] });
      return R({ items: listClients(text, 6).map((c) => ({ id: c.id, name: c.name, phone: c.phone, visits: c.visits, imported_visits: c.imported_visits })) });
    }
    if (p === "/api/admin/clients" && method === "POST") {
      adminOnly();
      const phone = normPhone(b.phone);
      if (str(b.name, 80).length < 2) throw bad("Completează numele."); if (!phoneValid(phone)) throw bad("Numărul de telefon nu pare corect.");
      if (S.clients.some((c) => c.phone === phone)) throw new E(409, "exists", "Există deja o clientă cu acest număr.");
      const id = upsertClient({ name: str(b.name, 80), phone, email: str(b.email, 120) }, "manual");
      Object.assign(client(id), { notes: str(b.notes, 600), imported_visits: b.existing ? 1 : 0 });
      return R(client(id), 201);
    }
    if (p === "/api/admin/clients/import") { adminOnly(); throw bad("În demo nu se importă fișiere. După lansare, aici se încarcă exportul din Mero."); }
    if ((m = /^\/api\/admin\/clients\/(\d+)$/.exec(p))) {
      const c = client(m[1]); if (!c) throw new E(404, "not_found", "Clienta nu există.");
      const history = S.appointments.filter((a) => a.client_id === c.id).sort((x, y) => y.date.localeCompare(x.date) || y.start_min - x.start_min);
      if (method === "GET") {
        if (isAdmin) return R({ ...c, history });
        const mine = history.filter((h) => h.staff_id === own);
        if (!mine.length) throw new E(403, "forbidden", "Clienta nu are programări la tine.");
        return R({ ...c, history: mine });
      }
      adminOnly();
      const phone = b.phone != null ? normPhone(b.phone) : c.phone;
      if (!phoneValid(phone)) throw bad("Numărul de telefon nu pare corect.");
      Object.assign(c, { name: b.name != null ? str(b.name, 80) || c.name : c.name, phone, email: b.email != null ? str(b.email, 120) : c.email, notes: b.notes != null ? str(b.notes, 600) : c.notes });
      return R(c);
    }

    adminOnly();
    if ((m = /^\/api\/admin\/staff\/([\w-]+)\/account$/.exec(p))) {
      const st = staffOne(m[1]); if (!st) throw new E(404, "not_found", "Persoana nu există.");
      if (b.action === "disable") { st.account = 0; return R({ ok: true }); }
      st.account = 1; st.must_change = 1;
      return R({ ok: true, password: "demo-" + String(1000 + (S.seq++ % 9000)), loginUrl: location.href.split("#")[0] });
    }
    if (p === "/api/admin/categories" && method === "POST") {
      const name = str(b.name, 60); if (name.length < 2) throw bad("Completează numele categoriei.");
      const id = uniq(S.categories, name); S.categories.push({ id, name, intro: str(b.intro, 400), sort: S.categories.length, active: 1 }); return R({ id }, 201);
    }
    if ((m = /^\/api\/admin\/categories\/([\w-]+)(\/move)?$/.exec(p))) {
      if (m[2]) { move(S.categories, m[1], b.dir); return R({ ok: true }); }
      const c = S.categories.find((x) => x.id === m[1]); if (!c) throw new E(404, "not_found", "Categoria nu există.");
      Object.assign(c, { name: b.name != null ? str(b.name, 60) || c.name : c.name, intro: b.intro != null ? str(b.intro, 400) : c.intro, active: b.active != null ? (b.active ? 1 : 0) : c.active });
      return R({ id: c.id });
    }
    if (p === "/api/admin/services" || /^\/api\/admin\/services\/[\w-]+$/.test(p)) {
      const id = p.split("/")[4], cur = id ? S.services.find((s) => s.id === id) : null;
      if (id && !cur) throw new E(404, "not_found", "Serviciul nu există.");
      const v = { cat_id: str(b.catId ?? cur?.cat_id, 60), name: str(b.name ?? cur?.name, 80), detail: str(b.detail ?? cur?.detail, 60), description: str(b.description ?? cur?.description, 400),
        dur: Number(b.dur ?? cur?.dur) | 0, dur_label: str(b.durLabel ?? cur?.dur_label, 40), price_min: Number(b.priceMin ?? cur?.price_min) | 0,
        price_max: Number(b.priceMax ?? b.priceMin ?? cur?.price_max) | 0, per_nail: (b.perNail ?? cur?.per_nail) ? 1 : 0, active: (b.active ?? cur?.active ?? 1) ? 1 : 0 };
      if (!S.categories.some((c) => c.id === v.cat_id)) throw bad("Alege categoria.");
      if (v.name.length < 2) throw bad("Completează numele serviciului.");
      if (v.dur < 10 || v.dur > 600) throw bad("Durata trebuie să fie între 10 și 600 de minute.");
      if (v.price_min < 0 || v.price_max < v.price_min) throw bad("Prețul maxim nu poate fi mai mic decât cel minim.");
      if (cur) { Object.assign(cur, v); return R({ id }); }
      const nid = uniq(S.services, v.name + (v.detail ? " " + v.detail : "")); S.services.push({ id: nid, ...v, sort: S.services.length }); return R({ id: nid }, 201);
    }
    if ((m = /^\/api\/admin\/services\/([\w-]+)\/move$/.exec(p))) { move(S.services, m[1], b.dir, (r, t) => r.cat_id === t.cat_id); return R({ ok: true }); }
    if ((m = /^\/api\/admin\/staff\/([\w-]+)\/move$/.exec(p))) { move(S.staff, m[1], b.dir); return R({ ok: true }); }
    if (p === "/api/admin/staff" || /^\/api\/admin\/staff\/[\w-]+$/.test(p)) {
      const id = p.split("/")[4], cur = id ? staffOne(id) : null;
      if (id && !cur) throw new E(404, "not_found", "Persoana nu există.");
      const name = str(b.name ?? cur?.name, 80); if (name.length < 2) throw bad("Completează numele.");
      const v = { name, initials: str(b.initials, 3) || cur?.initials || name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
        role: str(b.role ?? cur?.role, 60), cats: Array.isArray(b.cats) ? b.cats.join(" ") : cur?.cats || "", rating: str(b.rating ?? cur?.rating, 5),
        reviews: Number(b.reviews ?? cur?.reviews) | 0, active: (b.active ?? cur?.active ?? 1) ? 1 : 0 };
      if (cur) { Object.assign(cur, v); return R({ id }); }
      const nid = uniq(S.staff, name); S.staff.push({ id: nid, ...v, sort: S.staff.length, account: 0, must_change: 0 }); return R({ id: nid }, 201);
    }
    if (p === "/api/admin/messages" || p === "/api/admin/sms") return R({ items: S.messages });
    throw new E(404, "not_found", "Nu există.");
  }

  // Folosit de admin.js în locul lui fetch: aceleași răspunsuri ca serverul, cu o mică pauză ca să pară real
  window.ECLAT_DEMO_API = async (path, method = "GET", body) => {
    await new Promise((r) => setTimeout(r, 60));
    try { const r = handle(path, method, body || {}); save(); return { status: r.status, data: JSON.parse(JSON.stringify(r.data)) }; }
    catch (e) { if (!(e instanceof E)) { console.error(e); return { status: 500, data: { error: "server_error", message: "A apărut o eroare." } }; } save(); return { status: e.status, data: { error: e.code, message: e.message } }; }
  };

  // Mesajele de demo: pe ecranul de intrare și sus, în panou
  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("loginForm");
    if (form) form.querySelector("button[type=submit]").insertAdjacentHTML("beforebegin",
      '<p class="notice" style="margin:0">Demo: alege <b>Administratorul salonului</b> (proprietara) sau o angajată (Laura, Sonia) și scrie orice parolă.</p>');
    const main = document.querySelector(".main");
    if (main) main.insertAdjacentHTML("afterbegin",
      '<p class="demo-ribbon">Panou demo cu programări de exemplu · ce modifici rămâne doar în acest browser · <button type="button" onclick="ECLAT_DEMO_RESET()">reia de la zero</button></p>');
  });
})();
