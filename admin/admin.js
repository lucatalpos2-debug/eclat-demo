/* Éclat · panoul salonului */
(() => {
  "use strict";

  /* ============================== Utilitare ============================== */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fmtLei = (n) => `${Math.round(n || 0).toLocaleString("ro-RO")} lei`;
  const fmtPhone = (p) => String(p || "").replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");
  const DAYS = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
  const DSHORT = ["Du", "Lu", "Ma", "Mi", "Jo", "Vi", "Sâ"];
  // Telefon = ecran îngust: lista zilei în loc de grilă, carduri în loc de tabele, butonul +
  const phoneMQ = matchMedia("(max-width: 900px)");
  const waLink = (phone) => `https://wa.me/4${String(phone || "").replace(/\D/g, "")}`; // 07xxxxxxxx → 407xxxxxxxx
  const quickContact = (phone) => `<div class="quick"><a class="btn small" href="tel:${esc(phone)}"><svg><use href="#i-phone"/></svg>Sună</a><a class="btn small ghost" href="${waLink(phone)}" target="_blank" rel="noopener"><svg><use href="#i-wa"/></svg>WhatsApp</a></div>`;
  const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
  const MSHORT = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."];
  const dObj = (iso) => new Date(iso + "T00:00:00Z");
  const addDays = (iso, n) => { const d = dObj(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dowOf = (iso) => dObj(iso).getUTCDay();
  const longDate = (iso) => { const d = dObj(iso); return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const shortDate = (iso) => { if (!iso) return "—"; const d = dObj(iso); return `${d.getUTCDate()} ${MSHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const STATUS = { confirmed: ["Confirmată", ""], done: ["Finalizată", "ok"], no_show: ["Nu s-a prezentat", "warn"], cancelled: ["Anulată", "warn"] };
  const statusTag = (s, by = "") => `<span class="tag ${STATUS[s]?.[1] || ""}">${s === "cancelled" && by === "client" ? "Anulată de clientă" : STATUS[s]?.[0] || esc(s)}</span>`;
  const debounce = (fn, ms = 280) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  function nowRO() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour % 24) * 60 + +p.minute };
  }
  const timeOptions = (sel, from = 420, to = 1305) => {
    const opts = [];
    for (let m = from; m <= to; m += 15) opts.push(m);
    if (sel != null && !opts.includes(sel)) opts.push(sel), opts.sort((a, b) => a - b);
    return opts.map((m) => `<option value="${fmtTime(m)}"${m === sel ? " selected" : ""}>${fmtTime(m)}</option>`).join("");
  };

  /* ============================== Stare & API ============================== */
  const S = { catalog: null, salon: null, today: null, date: null, view: "calendar", cache: new Map(), listInit: false, me: null,
    day: { appts: [], blocks: [] }, calStaff: "", calMode: (() => { try { return localStorage.getItem("eclat-cal-mode") || "list"; } catch { return "list"; } })() };
  // Contul unei angajate vede doar programul ei; administratorul vede tot
  const isStaff = () => S.me?.role === "staff";
  const myStaff = () => S.catalog.staff.filter((p) => p.id === S.me.staffId);

  // În demo-ul de pe GitHub Pages, demo-api.js răspunde în locul serverului (date de exemplu, în browser)
  const DEMO = typeof window.ECLAT_DEMO_API === "function";
  const SITE_URL = DEMO ? "../" : "/";
  async function api(path, { method = "GET", body } = {}) {
    let status, data = null;
    if (DEMO) ({ status, data } = await window.ECLAT_DEMO_API(path, method, body));
    else {
      const opt = { method, headers: {}, credentials: "same-origin" };
      if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
      if (method !== "GET") opt.headers["X-Requested-With"] = "eclat";
      const r = await fetch(path, opt);
      status = r.status;
      try { data = await r.json(); } catch { /* fără corp */ }
    }
    if (status === 401 && path !== "/api/admin/login") { showLogin(); throw Object.assign(new Error(data?.message || "Autentifică-te din nou."), { status: 401 }); }
    if (status >= 400) throw Object.assign(new Error(data?.message || "A apărut o eroare."), { status, code: data?.error });
    return data;
  }
  const remember = (items) => items.forEach((a) => S.cache.set(a.id, a));

  let toastT;
  function toast(msg, err = false) {
    const t = $("#toast");
    t.textContent = msg; t.classList.toggle("err", err); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
  }
  const fail = (e) => { if (e.status !== 401) toast(e.message, true); };

  /* ============================== Catalog ============================== */
  async function loadCatalog() { S.catalog = await api("/api/admin/catalog"); }
  const svcById = (id) => S.catalog.services.find((s) => s.id === id);
  const staffById = (id) => S.catalog.staff.find((s) => s.id === id);
  const catName = (id) => S.catalog.categories.find((c) => c.id === id)?.name || id;
  const staffFor = (svc) => S.catalog.staff.filter((p) => p.active && (!svc || p.cats.includes(svc.cat_id)));
  function serviceOptions(selected) {
    return S.catalog.categories.map((c) => {
      const opts = S.catalog.services.filter((s) => s.cat_id === c.id && (s.active || s.id === selected))
        .map((s) => `<option value="${esc(s.id)}"${s.id === selected ? " selected" : ""}>${esc(s.label)} · ${esc(s.priceLabel)}${s.active ? "" : " (inactiv)"}</option>`).join("");
      return opts ? `<optgroup label="${esc(c.name)}">${opts}</optgroup>` : "";
    }).join("");
  }
  const staffOptions = (list, selected) => list.map((p) => `<option value="${esc(p.id)}"${p.id === selected ? " selected" : ""}>${esc(p.name)}</option>`).join("");

  /* ============================== Dialoguri ============================== */
  const modal = $("#modal");
  function openModal(html) {
    modal.innerHTML = html;
    if (!modal.open) modal.showModal();
    $$("[data-mclose]", modal).forEach((b) => b.addEventListener("click", () => modal.close()));
    return modal;
  }
  function confirmBox(message, { ok = "Da", danger = false, checkbox = "", checked = false } = {}) {
    return new Promise((resolve) => {
      const m = openModal(`<form method="dialog">
        <div class="m-head"><h2>Confirmare</h2><button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button></div>
        <div class="m-body"><p style="margin:0;font-size:17px">${esc(message)}</p>${checkbox ? `<label class="check"><input type="checkbox" id="cbx"${checked ? " checked" : ""}> ${esc(checkbox)}</label>` : ""}</div>
        <div class="m-foot"><button type="button" class="btn ghost" data-mclose>Renunță</button><button class="btn${danger ? " danger" : ""}" value="ok">${esc(ok)}</button></div>
      </form>`);
      m.addEventListener("close", function onClose() {
        m.removeEventListener("close", onClose);
        resolve({ ok: m.returnValue === "ok", checked: !!$("#cbx", m)?.checked });
        m.returnValue = "";
      });
    });
  }

  const drawer = $("#drawer"), scrim = $("#scrim");
  function openDrawer(html) {
    drawer.innerHTML = html; drawer.hidden = false; scrim.hidden = false;
    $$("[data-close]", drawer).forEach((b) => b.addEventListener("click", closeDrawer));
    $(".close", drawer)?.focus();
  }
  function closeDrawer() { drawer.hidden = true; scrim.hidden = true; drawer.innerHTML = ""; }
  scrim.addEventListener("click", closeDrawer);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden && !modal.open) closeDrawer(); });

  /* ============================== Autentificare ============================== */
  function showLogin() {
    $("#app").hidden = true; $("#login").hidden = false; closeDrawer();
    if (modal.open) { modal.oncancel = null; modal.close(); }
    loadLoginOptions(); setTimeout(() => $("#loginPass").focus(), 50);
  }
  // Lista „Cine intră”: administratorul + angajatele care au cont; ultima alegere rămâne selectată
  async function loadLoginOptions() {
    try {
      const r = await api("/api/admin/login-options");
      const sel = $("#loginUser"), last = localStorage.getItem("eclat-user") || "admin";
      sel.innerHTML = '<option value="admin">Administratorul salonului</option>' + r.users.map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");
      sel.value = [...sel.options].some((o) => o.value === last) ? last : "admin";
    } catch { /* rămâne doar administratorul */ }
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#loginErr"); err.hidden = true;
    try {
      await api("/api/admin/login", { method: "POST", body: { user: $("#loginUser").value, password: $("#loginPass").value } });
      try { localStorage.setItem("eclat-user", $("#loginUser").value); } catch { /* nu e critic */ }
      $("#loginPass").value = "";
      S.listInit = false; S.cache.clear();
      boot();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  async function logout() { try { await api("/api/admin/logout", { method: "POST" }); } catch { /* ignorat */ } showLogin(); }
  $("#logoutBtn").addEventListener("click", logout);

  /* ============================== Navigare ============================== */
  const VIEWS = { calendar: renderCalendar, list: renderList, clients: renderClients, services: renderServices, team: renderTeam };
  function setView(v, push = true) {
    if (!VIEWS[v] || (isStaff() && ["clients", "services", "team"].includes(v))) v = "calendar";
    S.view = v;
    $$(".view").forEach((s) => { s.hidden = s.dataset.view !== v; });
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    $("#moreBtn").classList.toggle("active", !isStaff() && ["services", "team"].includes(v));
    $("#fab").hidden = !["calendar", "list"].includes(v);
    if (push) history.replaceState(null, "", "#" + v);
    VIEWS[v]().catch(fail);
  }
  $$(".nav-item").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  const refresh = () => VIEWS[S.view]().catch(fail);
  function updateBadge(n) { const b = $("#unseenBadge"); b.textContent = n; b.hidden = !n; }

  /* ============================== CALENDAR ============================== */
  const PX = 1.6;
  $("#prevDay").addEventListener("click", () => { S.date = addDays(S.date, -1); renderCalendar().catch(fail); });
  $("#nextDay").addEventListener("click", () => { S.date = addDays(S.date, 1); renderCalendar().catch(fail); });
  $("#todayBtn").addEventListener("click", () => { S.date = nowRO().date; renderCalendar(true).catch(fail); });
  $("#calDate").addEventListener("change", (e) => { if (e.target.value) { S.date = e.target.value; renderCalendar().catch(fail); } });
  $("#newApptBtn").addEventListener("click", () => openNewAppt({ date: S.date }));
  $("#blockBtn").addEventListener("click", () => openBlock({ date: S.date }));

  async function renderCalendar(scrollNow = false) {
    $("#calDate").value = S.date;
    $("#calTitle").textContent = longDate(S.date) + (S.date === nowRO().date ? " · azi" : "");
    const [ap, bl, st] = await Promise.all([
      api(`/api/admin/appointments?from=${S.date}&to=${S.date}`),
      api(`/api/admin/blocks?from=${S.date}&to=${S.date}`),
      api(`/api/admin/stats?date=${S.date}`),
    ]);
    remember(ap.items);
    const appts = ap.items.filter((a) => a.status !== "cancelled");
    renderKpis(st);
    drawGrid(appts, bl.items, scrollNow);
    S.day = { appts, blocks: bl.items };
    renderDayStrip(); renderAgenda(); applyCalMode();
  }

  function renderKpis(st) {
    const k = isStaff()
      ? [["Programările mele", st.day.n || 0], ["Prime vizite", st.day.first || 0], ["Făcute online", st.day.website || 0]]
      : [["Programări", st.day.n || 0], ["Încasări estimate", fmtLei(st.day.revenue)], ["Prime vizite", st.day.first || 0], ["Făcute online", st.day.website || 0]];
    $("#kpis").innerHTML = k.map(([l, v]) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`).join("")
      + (st.unseen ? `<button class="kpi attn" id="kpiUnseen" style="text-align:left;font:inherit"><span>Programări online noi</span><b>${st.unseen}</b></button>` : "");
    $("#kpiUnseen")?.addEventListener("click", () => setView("list"));
    updateBadge(st.unseen);
  }

  function drawGrid(appts, blocks, scrollNow) {
    const staff = isStaff() ? myStaff() : S.catalog.staff.filter((p) => p.active || appts.some((a) => a.staff_id === p.id));
    const hours = S.salon.hours[dowOf(S.date)];
    let start = 480, end = 1200;
    appts.forEach((a) => { start = Math.min(start, Math.floor(a.start_min / 60) * 60); end = Math.max(end, Math.ceil(a.end_min / 60) * 60); });
    const H = (end - start) * PX;
    const cols = `64px repeat(${staff.length}, minmax(190px, 1fr))`;
    const labels = [];
    for (let m = start; m <= end; m += 60) labels.push(`<span style="top:${(m - start) * PX}px">${fmtTime(m)}</span>`);

    const now = nowRO(); // folosit doar ca, azi, calendarul să se deschidă la ora curentă
    const colHtml = staff.map((p) => {
      const mine = appts.filter((a) => a.staff_id === p.id);
      const closed = !hours ? `<div class="closed" style="top:0;height:${H}px"></div>`
        : `${hours[0] > start ? `<div class="closed" style="top:0;height:${(hours[0] - start) * PX}px"></div>` : ""}${hours[1] < end ? `<div class="closed" style="top:${(hours[1] - start) * PX}px;height:${(end - hours[1]) * PX}px"></div>` : ""}`;
      const evs = mine.map((a) => {
        const h = Math.max(24, (a.end_min - a.start_min) * PX - 3);
        const tags = [a.first_visit ? '<i class="tag gold">Prima vizită</i>' : "", a.source === "website" ? '<i class="tag">Online</i>' : "", a.status !== "confirmed" ? statusTag(a.status) : ""].join("");
        return `<button class="ev st-${a.status}${a.seen ? "" : " unseen"}${h < 66 ? " compact" : ""}" data-appt="${a.id}" style="top:${(a.start_min - start) * PX + 1}px;height:${h}px">
          <span class="ev-time">${fmtTime(a.start_min)}–${fmtTime(a.end_min)}</span><span class="ev-name">${esc(a.client_name)}</span>
          <span class="ev-svc">${esc(a.service_name)}</span><span class="ev-tags">${tags}</span></button>`;
      }).join("");
      const bls = blocks.filter((b) => b.staff_id === p.id || b.staff_id === "*").map((b) =>
        `<button class="blk" data-block="${b.id}" style="top:${(b.start_min - start) * PX + 1}px;height:${Math.max(24, (b.end_min - b.start_min) * PX - 3)}px">${esc(b.reason || "Blocat")} · ${fmtTime(b.start_min)}–${fmtTime(b.end_min)}</button>`).join("");
      return `<div class="col" data-staff="${esc(p.id)}" data-start="${start}" style="height:${H}px">${closed}${bls}${evs}</div>`;
    }).join("");

    const heads = staff.map((p) => {
      const n = appts.filter((a) => a.staff_id === p.id).length;
      return `<div class="col-head"><span class="mono">${esc(p.initials)}</span><div style="min-width:0"><b>${esc(p.name)}</b><small>${n ? `${n} ${n === 1 ? "programare" : "programări"}` : "liberă"}</small></div></div>`;
    }).join("");

    const wrap = $("#calWrap");
    const keepScroll = wrap.scrollTop;
    wrap.innerHTML = staff.length ? `<div class="cal" style="grid-template-columns:${cols}">
      <div class="corner"></div>${heads}
      <div class="time-col" style="height:${H}px">${labels.join("")}</div>${colHtml}
    </div>` : `<p class="empty">Nu există persoane active în echipă. Adaugă-le din secțiunea Echipă.</p>`;

    if (scrollNow || drawGrid.lastDate !== S.date) {
      const first = appts.length ? Math.min(...appts.map((a) => a.start_min)) : (hours ? hours[0] : start);
      const target = S.date === now.date ? Math.min(first, Math.max(start, now.minutes - 60)) : first - 30;
      wrap.scrollTop = Math.max(0, (target - start) * PX);
      drawGrid.lastDate = S.date;
    } else wrap.scrollTop = keepScroll;
  }

  $("#calWrap").addEventListener("click", (e) => {
    const ev = e.target.closest(".ev");
    if (ev) return openAppt(Number(ev.dataset.appt)).catch(fail);
    const bl = e.target.closest(".blk");
    if (bl) return removeBlock(Number(bl.dataset.block));
    const col = e.target.closest(".col");
    if (col && (e.target === col || e.target.classList.contains("closed"))) {
      const y = e.clientY - col.getBoundingClientRect().top;
      const m = Number(col.dataset.start) + Math.floor(y / PX / 15) * 15;
      openNewAppt({ date: S.date, staffId: col.dataset.staff, time: m });
    }
  });

  async function removeBlock(id) {
    const { ok } = await confirmBox("Ștergi acest interval blocat? Orele devin din nou disponibile pentru programări.", { ok: "Șterge", danger: true });
    if (!ok) return;
    try { await api(`/api/admin/blocks/${id}`, { method: "DELETE" }); toast("Intervalul a fost eliberat."); refresh(); } catch (e) { fail(e); }
  }

  /* ============================== Detalii programare ============================== */
  async function openAppt(id) {
    let a = S.cache.get(id);
    if (!a) return;
    const client = await api(`/api/admin/clients/${a.client_id}`);
    if (!a.seen) {
      try { a = await api(`/api/admin/appointments/${id}`, { method: "PATCH", body: { seen: true } }); S.cache.set(id, a); refresh(); } catch { /* nu e critic */ }
    }
    renderApptDrawer(a, client);
  }

  function renderApptDrawer(a, client) {
    const svc = svcById(a.service_id);
    const staffList = isStaff() ? S.catalog.staff.filter((p) => p.id === a.staff_id) : S.catalog.staff.filter((p) => p.active || p.id === a.staff_id);
    const past = client.history.filter((h) => h.id !== a.id);
    const done = client.history.filter((h) => h.status === "done").length;
    const noShows = client.history.filter((h) => h.status === "no_show").length;
    const spent = client.history.filter((h) => h.status === "done").reduce((s, h) => s + h.price_final, 0);
    openDrawer(`
      <div class="d-head">
        <button class="icon-btn small close" data-close aria-label="Închide"><svg><use href="#i-x"/></svg></button>
        <h2 id="drawerTitle">${esc(a.client_name)}</h2>
        <div class="d-sub"><a href="tel:${esc(a.phone)}"><svg><use href="#i-phone"/></svg>${esc(fmtPhone(a.phone))}</a>
          ${a.first_visit ? `<span class="tag gold">Prima vizită · −${a.discount_pct}%</span>` : '<span class="tag">Clientă revenită</span>'}
          <span class="tag">${a.source === "website" ? "Programată online" : "Adăugată în salon"}</span>
          ${a.status === "cancelled" && a.cancelled_by === "client" ? '<span class="tag warn">Anulată de clientă, din linkul primit pe e-mail</span>' : ""}</div>
        ${quickContact(a.phone)}
      </div>
      <div class="d-body">
        <div class="section-title">Status</div>
        <div class="seg" id="seg">${Object.entries(STATUS).map(([k, [l]]) => `<button type="button" data-s="${k}" aria-pressed="${a.status === k}">${l}</button>`).join("")}</div>
        <div class="section-title">Programarea</div>
        <form id="apptForm" class="grid2">
          <label class="field full"><span>Serviciu</span><select id="eSvc">${serviceOptions(a.service_id)}</select></label>
          <label class="field"><span>Specialistă</span><select id="eStaff">${staffOptions(staffList, a.staff_id)}</select></label>
          <label class="field"><span>Data</span><input type="date" id="eDate" value="${a.date}"></label>
          <label class="field"><span>Ora</span><select id="eTime">${timeOptions(a.start_min)}</select></label>
          <label class="field"><span>Durata (minute)</span><input type="number" id="eDur" min="15" max="600" step="5" value="${a.end_min - a.start_min}"></label>
          <label class="field"><span>Preț final (lei)</span><input type="number" id="ePrice" min="0" step="1" value="${a.price_final}"><small>Listă: ${esc(a.price_label)}${a.discount_pct ? ` · reducere ${a.discount_pct}%` : ""}</small></label>
          <label class="field full"><span>Observații</span><textarea id="eNotes">${esc(a.notes)}</textarea></label>
        </form>
        <div class="section-title">Clienta</div>
        <div class="facts"><div><span>Vizite finalizate</span><b>${done + (client.imported_visits ? "+" : "")}</b></div><div><span>Absențe</span><b>${noShows}</b></div><div><span>Total cheltuit</span><b>${fmtLei(spent)}</b></div></div>
        ${past.length ? `<div class="history">${past.slice(0, 5).map((h) => `<div><span>${shortDate(h.date)} · ${esc(h.service_name)}</span>${statusTag(h.status, h.cancelled_by)}</div>`).join("")}</div>` : '<p class="hint" style="margin:0">Nu există alte programări în istoric.</p>'}
        ${a.changed_by ? `<p class="changed-by">Ultima modificare: ${esc(a.changed_by)}</p>` : ""}
        ${isStaff() ? "" : '<button type="button" class="link" id="openClient" style="justify-self:start">Deschide fișa clientei</button>'}
      </div>
      <div class="d-foot"><button class="btn ghost" data-close>Închide</button><button class="btn" id="saveAppt">Salvează modificările</button></div>`);

    $("#eSvc").addEventListener("change", (e) => {
      const s = svcById(e.target.value);
      if (s) { $("#eDur").value = s.dur; $("#ePrice").value = Math.round(s.price_min * (1 - (a.discount_pct || 0) / 100)); }
    });
    $("#openClient")?.addEventListener("click", () => openClient(a.client_id).catch(fail));
    $("#seg").addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b || b.dataset.s === a.status) return;
      let body = { status: b.dataset.s };
      if (b.dataset.s === "cancelled") {
        const msg = "Anulezi programarea? Ora devine liberă pentru alte cliente.";
        const r = await confirmBox(a.client_email ? msg : `${msg} Clienta nu are e-mail salvat, așa că anunț-o telefonic.`,
          { ok: "Anulează programarea", danger: true, checkbox: a.client_email ? `Trimite clientei e-mail de anulare (${a.client_email})` : "", checked: true });
        if (!r.ok) return;
        body.notifyClient = r.checked;
      }
      try {
        const upd = await api(`/api/admin/appointments/${a.id}`, { method: "PATCH", body });
        S.cache.set(upd.id, upd); toast(`Status: ${STATUS[upd.status][0]}.`);
        refresh(); renderApptDrawer(upd, await api(`/api/admin/clients/${upd.client_id}`));
      } catch (ex) { fail(ex); }
    });
    $("#saveAppt").addEventListener("click", () => saveAppt(a));
    void svc;
  }

  async function saveAppt(a, force = false) {
    const body = { serviceId: $("#eSvc").value, staffId: $("#eStaff").value, date: $("#eDate").value, time: $("#eTime").value,
      duration: Number($("#eDur").value), priceFinal: $("#ePrice").value, notes: $("#eNotes").value, force };
    try {
      const upd = await api(`/api/admin/appointments/${a.id}`, { method: "PATCH", body });
      S.cache.set(upd.id, upd); toast("Modificările au fost salvate."); closeDrawer(); refresh();
    } catch (e) {
      if (e.code === "overlap") {
        const r = await confirmBox(`${e.message} Salvezi oricum?`, { ok: "Salvează oricum" });
        if (r.ok) return saveAppt(a, true);
        return;
      }
      fail(e);
    }
  }

  /* ============================== Programare nouă ============================== */
  function openNewAppt({ date, staffId, time, client } = {}) {
    const first = S.catalog.services.find((s) => s.active);
    const svcId = first?.id;
    openModal(`<form id="naForm" novalidate>
      <div class="m-head"><h2>Programare nouă</h2><button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button></div>
      <div class="m-body">
        <div class="grid2">
          <label class="field"><span>Telefon clientă</span><input id="naPhone" inputmode="tel" autocomplete="off" placeholder="07xx xxx xxx" value="${esc(client?.phone || "")}"></label>
          <label class="field"><span>Nume clientă</span><input id="naName" autocomplete="off" value="${esc(client?.name || "")}"></label>
        </div>
        <div class="suggest" id="naSuggest" hidden></div>
        <p class="notice" id="naInfo" hidden></p>
        <label class="field"><span>Serviciu</span><select id="naSvc">${serviceOptions(svcId)}</select></label>
        <div class="grid3">
          <label class="field"><span>Specialistă</span><select id="naStaff"></select></label>
          <label class="field"><span>Data</span><input type="date" id="naDate" value="${date || S.date}"></label>
          <label class="field"><span>Ora</span><select id="naTime">${timeOptions(time ?? 600)}</select></label>
        </div>
        <div class="grid2">
          <label class="field"><span>Preț (lei)</span><input type="number" id="naPrice" min="0" placeholder="automat"><small>Gol = prețul din listă (cu −20% dacă e prima vizită)</small></label>
          <label class="field"><span>Durata (minute)</span><input type="number" id="naDur" min="15" max="600" step="5"></label>
        </div>
        <label class="field"><span>Observații</span><textarea id="naNotes"></textarea></label>
        <p class="form-error" id="naErr" hidden></p>
      </div>
      <div class="m-foot"><button type="button" class="btn ghost" data-mclose>Renunță</button><button class="btn" type="submit">Salvează programarea</button></div>
    </form>`);
    let clientId = client?.id || null;
    const fillStaff = () => {
      const s = svcById($("#naSvc").value);
      const list = isStaff() ? myStaff() : staffFor(s);
      const cur = $("#naStaff").value || staffId;
      $("#naStaff").innerHTML = staffOptions(list, list.some((p) => p.id === cur) ? cur : list[0]?.id);
      $("#naDur").value = s?.dur || "";
    };
    fillStaff();
    $("#naSvc").addEventListener("change", fillStaff);

    const sug = $("#naSuggest");
    const lookup = debounce(async (q) => {
      if (q.replace(/\s/g, "").length < 3) { sug.hidden = true; return; }
      try {
        const r = await api(`/api/admin/clients?q=${encodeURIComponent(q)}&limit=6`);
        sug.innerHTML = r.items.map((c) => `<button type="button" data-id="${c.id}" data-name="${esc(c.name)}" data-phone="${esc(c.phone)}" data-visits="${c.visits}" data-imp="${c.imported_visits}">
          <span><b>${esc(c.name)}</b> · ${esc(fmtPhone(c.phone))}</span><small>${c.visits} vizite${c.imported_visits ? " · din Mero" : ""}</small></button>`).join("");
        sug.hidden = !r.items.length;
      } catch (e) { fail(e); }
    });
    ["naPhone", "naName"].forEach((id) => $("#" + id).addEventListener("input", (e) => { clientId = null; $("#naInfo").hidden = true; lookup(e.target.value); }));
    sug.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      clientId = Number(b.dataset.id); $("#naPhone").value = fmtPhone(b.dataset.phone); $("#naName").value = b.dataset.name;
      sug.hidden = true;
      $("#naInfo").textContent = `Clientă existentă · ${b.dataset.visits} vizite finalizate${b.dataset.imp > 0 ? " · importată din Mero" : ""}. Nu primește reducerea de prima vizită.`;
      $("#naInfo").hidden = false;
    });

    $("#naForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#naErr"); err.hidden = true;
      const send = async (force) => {
        const body = { serviceId: $("#naSvc").value, staffId: $("#naStaff").value, date: $("#naDate").value, time: $("#naTime").value,
          duration: Number($("#naDur").value) || undefined, priceFinal: $("#naPrice").value, notes: $("#naNotes").value, force,
          ...(clientId ? { clientId } : { client: { name: $("#naName").value, phone: $("#naPhone").value } }) };
        return api("/api/admin/appointments", { method: "POST", body });
      };
      try {
        let saved;
        try { saved = await send(false); } catch (ex) {
          if (ex.code !== "overlap") throw ex;
          if (!window.confirm(`${ex.message} Salvezi oricum?`)) return;
          saved = await send(true);
        }
        modal.close();
        toast(`Programare salvată: ${saved.client_name}, ${fmtTime(saved.start_min)}.`);
        if (S.view === "calendar" && saved.date !== S.date) { S.date = saved.date; }
        refresh();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  /* ============================== Blocare timp ============================== */
  function openBlock({ date }) {
    const staff = isStaff() ? myStaff() : S.catalog.staff.filter((p) => p.active);
    openModal(`<form id="blkForm" novalidate>
      <div class="m-head"><h2>Blochează timp</h2><button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button></div>
      <div class="m-body">
        <p class="hint" style="margin:0">În intervalul blocat nu se pot face programări online. Folosește-l pentru pauze, concedii sau training.</p>
        <label class="field"><span>Pentru cine</span><select id="bStaff">${isStaff() ? "" : '<option value="*">Toată echipa</option>'}${staffOptions(staff)}</select></label>
        <div class="grid3">
          <label class="field"><span>Data</span><input type="date" id="bDate" value="${date}"></label>
          <label class="field"><span>De la</span><select id="bFrom">${timeOptions(780)}</select></label>
          <label class="field"><span>Până la</span><select id="bTo">${timeOptions(840)}</select></label>
        </div>
        <label class="field"><span>Motiv</span><input id="bReason" list="reasons" placeholder="Pauză de masă"><datalist id="reasons"><option value="Pauză de masă"><option value="Concediu"><option value="Training"><option value="Medical"></datalist></label>
        <label class="check"><input type="checkbox" id="bAllDay"> Toată ziua</label>
        <p class="form-error" id="bErr" hidden></p>
      </div>
      <div class="m-foot"><button type="button" class="btn ghost" data-mclose>Renunță</button><button class="btn" type="submit">Blochează</button></div>
    </form>`);
    $("#bAllDay").addEventListener("change", (e) => { $("#bFrom").disabled = $("#bTo").disabled = e.target.checked; });
    $("#blkForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const all = $("#bAllDay").checked;
      try {
        await api("/api/admin/blocks", { method: "POST", body: { staffId: $("#bStaff").value, date: $("#bDate").value,
          from: all ? "00:00" : $("#bFrom").value, to: all ? "23:59" : $("#bTo").value, reason: $("#bReason").value || (all ? "Liber" : "Pauză") } });
        modal.close(); toast("Intervalul a fost blocat."); refresh();
      } catch (ex) { $("#bErr").textContent = ex.message; $("#bErr").hidden = false; }
    });
  }

  /* ============================== LISTĂ PROGRAMĂRI ============================== */
  async function renderList() {
    if (!S.listInit) {
      $("#fFrom").value = nowRO().date; $("#fTo").value = addDays(nowRO().date, 14);
      $("#fStaff").innerHTML = '<option value="">Toate</option>' + staffOptions(S.catalog.staff);
      const go = () => renderList().catch(fail);
      ["fFrom", "fTo", "fStatus", "fStaff"].forEach((id) => $("#" + id).addEventListener("change", go));
      $("#fQ").addEventListener("input", debounce(go));
      $("#listFilters").addEventListener("submit", (e) => e.preventDefault());
      $("#listTable").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-appt]"); if (tr) openAppt(Number(tr.dataset.appt)).catch(fail); });
      $("#listCards").addEventListener("click", (e) => { const c = e.target.closest("[data-appt]"); if (c) openAppt(Number(c.dataset.appt)).catch(fail); });
      S.listInit = true;
    }
    const p = new URLSearchParams({ from: $("#fFrom").value, to: $("#fTo").value, status: $("#fStatus").value, staff: $("#fStaff").value, q: $("#fQ").value });
    const [r, st] = await Promise.all([api("/api/admin/appointments?" + p), api("/api/admin/stats")]);
    updateBadge(st.unseen);
    remember(r.items);
    $("#listTable").innerHTML = r.items.length ? `<table><thead><tr><th>Data</th><th>Ora</th><th>Clientă</th><th>Telefon</th><th>Serviciu</th><th>Specialistă</th><th>Preț</th><th>Sursă</th><th>Status</th></tr></thead><tbody>
      ${r.items.map((a) => `<tr data-appt="${a.id}"><td class="num">${a.seen ? "" : '<span class="dot" title="Nouă"></span> '}${shortDate(a.date)}</td><td class="num">${fmtTime(a.start_min)}</td>
        <td><b>${esc(a.client_name)}</b>${a.first_visit ? ' <span class="tag gold">Prima</span>' : ""}</td><td class="num">${esc(fmtPhone(a.phone))}</td>
        <td>${esc(a.service_name)}</td><td>${esc(staffById(a.staff_id)?.name || a.staff_id)}</td><td class="num">${fmtLei(a.price_final)}</td>
        <td>${a.source === "website" ? "Online" : "Salon"}</td><td>${statusTag(a.status, a.cancelled_by)}</td></tr>`).join("")}</tbody></table>`
      : '<p class="empty">Nicio programare în intervalul ales.</p>';
    renderListCards(r.items);
  }

  /* ============================== CLIENTE ============================== */
  let clientsInit = false;
  async function renderClients() {
    if (!clientsInit) {
      $("#cQ").addEventListener("input", debounce(() => renderClients().catch(fail)));
      $("#clientsTable").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-client]"); if (tr) openClient(Number(tr.dataset.client)).catch(fail); });
      $("#clientsCards").addEventListener("click", (e) => { const c = e.target.closest("[data-client]"); if (c) openClient(Number(c.dataset.client)).catch(fail); });
      clientsInit = true;
    }
    const r = await api(`/api/admin/clients?q=${encodeURIComponent($("#cQ").value)}&limit=300`);
    const SRC = { website: "Site", manual: "Salon", import: "Mero" };
    $("#clientsTable").innerHTML = r.items.length ? `<table><thead><tr><th>Nume</th><th>Telefon</th><th>Vizite</th><th>Ultima vizită</th><th>Următoarea</th><th>Total</th><th>Absențe</th><th>Sursă</th></tr></thead><tbody>
      ${r.items.map((c) => `<tr data-client="${c.id}"><td><b>${esc(c.name)}</b></td><td class="num">${esc(fmtPhone(c.phone))}</td><td class="num">${c.visits}${c.imported_visits ? "+" : ""}</td>
        <td class="num">${shortDate(c.last_visit)}</td><td class="num">${c.next_visit ? shortDate(c.next_visit) : "—"}</td><td class="num">${fmtLei(c.spent)}</td>
        <td class="num">${c.no_shows ? `<span class="tag warn">${c.no_shows}</span>` : "0"}</td><td>${SRC[c.source] || c.source}</td></tr>`).join("")}</tbody></table>`
      : `<p class="empty">${$("#cQ").value ? "Nicio clientă găsită." : "Încă nu există cliente. Importă lista din Mero sau adaugă prima clientă."}</p>`;
    // Pe telefon: aceleași cliente, ca fișe ușor de atins
    $("#clientsCards").innerHTML = r.items.length ? r.items.map((c) => `<button type="button" class="cl-item" data-client="${c.id}">
        <span class="cl-top"><b>${esc(c.name)}</b><span class="cl-phone">${esc(fmtPhone(c.phone))}</span></span>
        <span class="cl-meta">${c.visits ? `${c.visits} ${c.visits === 1 ? "vizită" : "vizite"}` : c.imported_visits ? "Clientă existentă" : "Clientă nouă"}${c.last_visit ? ` · ultima ${shortDate(c.last_visit)}` : ""}${c.next_visit ? ` · următoarea ${shortDate(c.next_visit)}` : ""}</span>
        <span class="ag-tags">${c.no_shows ? `<i class="tag warn">${c.no_shows} ${c.no_shows === 1 ? "absență" : "absențe"}</i>` : ""}<i class="tag">${SRC[c.source] || esc(c.source)}</i>${c.spent ? `<i class="tag">${fmtLei(c.spent)}</i>` : ""}</span>
      </button>`).join("") : $("#clientsTable").innerHTML;
  }

  async function openClient(id) {
    const c = await api(`/api/admin/clients/${id}`);
    const done = c.history.filter((h) => h.status === "done");
    openDrawer(`
      <div class="d-head">
        <button class="icon-btn small close" data-close aria-label="Închide"><svg><use href="#i-x"/></svg></button>
        <h2 id="drawerTitle">${esc(c.name)}</h2>
        <div class="d-sub"><a href="tel:${esc(c.phone)}"><svg><use href="#i-phone"/></svg>${esc(fmtPhone(c.phone))}</a>${c.imported_visits ? '<span class="tag">Importată din Mero</span>' : ""}</div>
        ${quickContact(c.phone)}
      </div>
      <div class="d-body">
        <div class="facts"><div><span>Vizite finalizate</span><b>${done.length}${c.imported_visits ? "+" : ""}</b></div><div><span>Absențe</span><b>${c.history.filter((h) => h.status === "no_show").length}</b></div><div><span>Total cheltuit</span><b>${fmtLei(done.reduce((s, h) => s + h.price_final, 0))}</b></div></div>
        <form id="clForm" class="grid2">
          <label class="field"><span>Nume</span><input id="clName" value="${esc(c.name)}"></label>
          <label class="field"><span>Telefon</span><input id="clPhone" value="${esc(fmtPhone(c.phone))}" inputmode="tel"></label>
          <label class="field full"><span>E-mail</span><input id="clEmail" type="email" value="${esc(c.email)}"></label>
          <label class="field full"><span>Notițe despre clientă</span><textarea id="clNotes" placeholder="Preferințe, alergii, forma preferată…">${esc(c.notes)}</textarea></label>
        </form>
        <div class="section-title">Istoric</div>
        ${c.history.length ? `<div class="history">${c.history.map((h) => `<div><span>${shortDate(h.date)} · ${fmtTime(h.start_min)} · ${esc(h.service_name)}</span>${statusTag(h.status, h.cancelled_by)}</div>`).join("")}</div>` : '<p class="hint" style="margin:0">Nicio programare încă.</p>'}
      </div>
      <div class="d-foot"><button class="btn ghost" id="clBook">Programare nouă</button><button class="btn" id="clSave">Salvează</button></div>`);
    $("#clBook").addEventListener("click", () => { closeDrawer(); openNewAppt({ date: S.date || nowRO().date, client: c }); });
    $("#clSave").addEventListener("click", async () => {
      try {
        await api(`/api/admin/clients/${c.id}`, { method: "PATCH", body: { name: $("#clName").value, phone: $("#clPhone").value, email: $("#clEmail").value, notes: $("#clNotes").value } });
        toast("Fișa clientei a fost salvată."); closeDrawer(); refresh();
      } catch (e) { fail(e); }
    });
  }

  $("#newClientBtn").addEventListener("click", () => {
    openModal(`<form id="ncForm" novalidate>
      <div class="m-head"><h2>Clientă nouă</h2><button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button></div>
      <div class="m-body">
        <div class="grid2"><label class="field"><span>Nume</span><input id="ncName"></label><label class="field"><span>Telefon</span><input id="ncPhone" inputmode="tel" placeholder="07xx xxx xxx"></label></div>
        <label class="field"><span>E-mail (opțional)</span><input id="ncEmail" type="email"></label>
        <label class="field"><span>Notițe</span><textarea id="ncNotes"></textarea></label>
        <label class="check"><input type="checkbox" id="ncExisting" checked> A mai fost la salon (nu primește reducerea de prima vizită)</label>
        <p class="form-error" id="ncErr" hidden></p>
      </div>
      <div class="m-foot"><button type="button" class="btn ghost" data-mclose>Renunță</button><button class="btn" type="submit">Adaugă clienta</button></div>
    </form>`);
    $("#ncForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/api/admin/clients", { method: "POST", body: { name: $("#ncName").value, phone: $("#ncPhone").value, email: $("#ncEmail").value, notes: $("#ncNotes").value, existing: $("#ncExisting").checked } });
        modal.close(); toast("Clienta a fost adăugată."); renderClients().catch(fail);
      } catch (ex) { $("#ncErr").textContent = ex.message; $("#ncErr").hidden = false; }
    });
  });

  $("#importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    if (f.size > 4_500_000) return toast("Fișierul este prea mare (maxim 4,5 MB).", true);
    try {
      const csv = await f.text();
      const r = await api("/api/admin/clients/import", { method: "POST", body: { csv } });
      toast(`Import gata: ${r.imported} cliente noi, ${r.updated} actualizate${r.skipped ? `, ${r.skipped} rânduri fără telefon valid` : ""}.`);
      renderClients().catch(fail);
    } catch (ex) { fail(ex); }
  });

  /* ============================== SERVICII ============================== */
  async function renderServices() {
    await loadCatalog();
    const { categories, services } = S.catalog;
    $("#servicesList").innerHTML = categories.map((c, ci) => {
      const list = services.filter((s) => s.cat_id === c.id);
      return `<section class="cat-card">
        <div class="cat-head"><div><h2>${esc(c.name)} ${c.active ? "" : '<span class="tag warn">ascunsă</span>'}</h2>${c.intro ? `<p>${esc(c.intro)}</p>` : ""}</div>
          <div class="row-actions">
            <button class="icon-btn small" data-cat-move="${esc(c.id)}" data-dir="-1" aria-label="Mută mai sus"${ci === 0 ? " disabled" : ""}><svg><use href="#i-up"/></svg></button>
            <button class="icon-btn small" data-cat-move="${esc(c.id)}" data-dir="1" aria-label="Mută mai jos"${ci === categories.length - 1 ? " disabled" : ""}><svg><use href="#i-down"/></svg></button>
            <button class="btn ghost small" data-cat-edit="${esc(c.id)}">Editează</button>
            <button class="btn small" data-svc-new="${esc(c.id)}"><svg><use href="#i-plus"/></svg>Serviciu</button>
          </div></div>
        ${list.length ? list.map((s, i) => `<div class="svc-row${s.active ? "" : " off"}">
          <div><div class="nm">${esc(s.name)}${s.detail ? ` <i>${esc(s.detail)}</i>` : ""}</div><div class="meta">${esc(s.durText)} · ${s.dur} min în calendar${s.active ? "" : " · nu apare pe site"}</div></div>
          <div class="pr">${esc(s.priceLabel)}</div>
          <label class="check" title="Afișat pe site"><input type="checkbox" data-svc-toggle="${esc(s.id)}"${s.active ? " checked" : ""}> Pe site</label>
          <div class="row-actions">
            <button class="icon-btn small" data-svc-move="${esc(s.id)}" data-dir="-1" aria-label="Mută mai sus"${i === 0 ? " disabled" : ""}><svg><use href="#i-up"/></svg></button>
            <button class="icon-btn small" data-svc-move="${esc(s.id)}" data-dir="1" aria-label="Mută mai jos"${i === list.length - 1 ? " disabled" : ""}><svg><use href="#i-down"/></svg></button>
            <button class="btn ghost small" data-svc-edit="${esc(s.id)}">Editează</button>
          </div></div>`).join("") : '<p class="empty">Niciun serviciu în această categorie.</p>'}
      </section>`;
    }).join("");
  }

  $("#servicesList").addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    try {
      if (t.dataset.svcEdit) return serviceModal(svcById(t.dataset.svcEdit));
      if (t.dataset.svcNew) return serviceModal(null, t.dataset.svcNew);
      if (t.dataset.catEdit) return categoryModal(S.catalog.categories.find((c) => c.id === t.dataset.catEdit));
      if (t.dataset.svcMove) { await api(`/api/admin/services/${t.dataset.svcMove}/move`, { method: "POST", body: { dir: Number(t.dataset.dir) } }); return renderServices(); }
      if (t.dataset.catMove) { await api(`/api/admin/categories/${t.dataset.catMove}/move`, { method: "POST", body: { dir: Number(t.dataset.dir) } }); return renderServices(); }
    } catch (ex) { fail(ex); }
  });
  $("#servicesList").addEventListener("change", async (e) => {
    const id = e.target.dataset.svcToggle; if (!id) return;
    try { await api(`/api/admin/services/${id}`, { method: "PATCH", body: { active: e.target.checked } }); toast(e.target.checked ? "Serviciul apare pe site." : "Serviciul a fost ascuns de pe site."); renderServices().catch(fail); }
    catch (ex) { fail(ex); }
  });
  $("#newCatBtn").addEventListener("click", () => categoryModal(null));

  function serviceModal(s, catId) {
    const cats = S.catalog.categories;
    openModal(`<form id="svForm" novalidate>
      <div class="m-head"><h2>${s ? "Editează serviciul" : "Serviciu nou"}</h2><button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button></div>
      <div class="m-body">
        <label class="field"><span>Categorie</span><select id="svCat">${cats.map((c) => `<option value="${esc(c.id)}"${c.id === (s?.cat_id || catId) ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
        <div class="grid2">
          <label class="field"><span>Nume</span><input id="svName" value="${esc(s?.name || "")}" placeholder="ex. Manichiură clasică"></label>
          <label class="field"><span>Detaliu (opțional)</span><input id="svDetail" value="${esc(s?.detail || "")}" placeholder="ex. S · M · L"><small>Apare în italic lângă nume</small></label>
        </div>
        <label class="field"><span>Descriere</span><textarea id="svDesc" placeholder="Ce include serviciul">${esc(s?.description || "")}</textarea></label>
        <div class="grid2">
          <label class="field"><span>Durata în calendar (minute)</span><input type="number" id="svDur" min="10" max="600" step="5" value="${s?.dur || 60}"></label>
          <label class="field"><span>Durata afișată pe site (opțional)</span><input id="svDurLabel" value="${esc(s?.dur_label || "")}" placeholder="ex. 1h 30 – 1h 45"></label>
        </div>
        <div class="grid2">
          <label class="field"><span>Preț minim (lei)</span><input type="number" id="svMin" min="0" value="${s?.price_min ?? ""}"></label>
          <label class="field"><span>Preț maxim (lei)</span><input type="number" id="svMax" min="0" value="${s?.price_max ?? ""}"><small>La fel ca minimul dacă prețul e fix</small></label>
        </div>
        <label class="check"><input type="checkbox" id="svPerNail"${s?.per_nail ? " checked" : ""}> Prețul este per unghie</label>
        <label class="check"><input type="checkbox" id="svActive"${!s || s.active ? " checked" : ""}> Afișat pe site și în programarea online</label>
        <p class="form-error" id="svErr" hidden></p>
      </div>
      <div class="m-foot"><button type="button" class="btn ghost" data-mclose>Renunță</button><button class="btn" type="submit">${s ? "Salvează" : "Adaugă serviciul"}</button></div>
    </form>`);
    $("#svForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const min = $("#svMin").value, max = $("#svMax").value || min;
      const body = { catId: $("#svCat").value, name: $("#svName").value, detail: $("#svDetail").value, description: $("#svDesc").value,
        dur: Number($("#svDur").value), durLabel: $("#svDurLabel").value, priceMin: Number(min), priceMax: Number(max),
        perNail: $("#svPerNail").checked, active: $("#svActive").checked };
      try {
        if (s) await api(`/api/admin/services/${s.id}`, { method: "PATCH", body });
        else await api("/api/admin/services", { method: "POST", body });
        modal.close(); toast(s ? "Serviciul a fost actualizat pe site." : "Serviciul a fost adăugat pe site."); renderServices().catch(fail);
      } catch (ex) { $("#svErr").textContent = ex.message; $("#svErr").hidden = false; }
    });
  }

  function categoryModal(c) {
    openModal(`<form id="ctForm" novalidate>
      <div class="m-head"><h2>${c ? "Editează categoria" : "Categorie nouă"}</h2><button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button></div>
      <div class="m-body">
        <label class="field"><span>Nume</span><input id="ctName" value="${esc(c?.name || "")}" placeholder="ex. Gene"></label>
        <label class="field"><span>Text scurt sub categorie (opțional)</span><textarea id="ctIntro">${esc(c?.intro || "")}</textarea></label>
        <label class="check"><input type="checkbox" id="ctActive"${!c || c.active ? " checked" : ""}> Afișată pe site</label>
        ${c ? "" : '<p class="notice" style="margin:0">După ce adaugi categoria, bifează la Echipă cine face aceste servicii, ca să poată fi programate online.</p>'}
        <p class="form-error" id="ctErr" hidden></p>
      </div>
      <div class="m-foot"><button type="button" class="btn ghost" data-mclose>Renunță</button><button class="btn" type="submit">${c ? "Salvează" : "Adaugă categoria"}</button></div>
    </form>`);
    $("#ctForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = { name: $("#ctName").value, intro: $("#ctIntro").value, active: $("#ctActive").checked };
      try {
        if (c) await api(`/api/admin/categories/${c.id}`, { method: "PATCH", body });
        else await api("/api/admin/categories", { method: "POST", body });
        modal.close(); toast("Categoria a fost salvată."); renderServices().catch(fail);
      } catch (ex) { $("#ctErr").textContent = ex.message; $("#ctErr").hidden = false; }
    });
  }

  /* ============================== ECHIPĂ ============================== */
  async function renderTeam() {
    await loadCatalog();
    const { staff } = S.catalog;
    $("#teamList").innerHTML = staff.map((p, i) => `<article class="team-card${p.active ? "" : " off"}">
      <span class="mono">${esc(p.initials)}</span>
      <div style="min-width:0">
        <h3>${esc(p.name)} ${p.active ? "" : '<span class="tag warn">inactivă</span>'}</h3>
        <div class="role">${esc(p.role)}${p.rating ? ` · ${esc(p.rating)} ★ (${p.reviews} recenzii)` : ""}</div>
        <div class="cats">${p.cats.length ? p.cats.map((c) => `<span class="tag">${esc(catName(c))}</span>`).join("") : '<span class="tag warn">Nicio categorie: nu poate fi programată online</span>'}</div>
        <div class="cal-link"><input readonly value="${esc(p.calUrl)}" aria-label="Link calendar ${esc(p.name)}" id="cal-${esc(p.id)}">
          <button class="btn small" data-copy="cal-${esc(p.id)}">Copiază linkul</button>
          <button class="btn ghost small" data-cal-reset="${esc(p.id)}">Link nou</button></div>
        <div class="acc">${p.hasAccount
          ? `<span class="tag ok">Are cont în panou</span><button class="btn ghost small" data-acc="reset" data-id="${esc(p.id)}">Parolă nouă</button><button class="btn ghost small" data-acc="disable" data-id="${esc(p.id)}">Oprește contul</button>`
          : `<span class="tag">Fără cont în panou</span><button class="btn small" data-acc="create" data-id="${esc(p.id)}"${p.active ? "" : " disabled"}>Creează cont</button>`}</div>
      </div>
      <div class="row-actions">
        <button class="icon-btn small" data-st-move="${esc(p.id)}" data-dir="-1" aria-label="Mută mai sus"${i === 0 ? " disabled" : ""}><svg><use href="#i-up"/></svg></button>
        <button class="icon-btn small" data-st-move="${esc(p.id)}" data-dir="1" aria-label="Mută mai jos"${i === staff.length - 1 ? " disabled" : ""}><svg><use href="#i-down"/></svg></button>
        <button class="btn ghost small" data-st-edit="${esc(p.id)}">Editează</button>
      </div>
    </article>`).join("") || '<p class="empty">Nicio persoană în echipă.</p>';
  }

  $("#teamList").addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    try {
      if (t.dataset.copy) {
        const inp = document.getElementById(t.dataset.copy);
        try { await navigator.clipboard.writeText(inp.value); toast("Linkul a fost copiat."); }
        catch { inp.select(); toast("Selectat. Apasă Cmd/Ctrl + C pentru a copia."); }
        return;
      }
      if (t.dataset.acc) return staffAccount(t.dataset.id, t.dataset.acc);
      if (t.dataset.stEdit) return staffModal(staffById(t.dataset.stEdit));
      if (t.dataset.stMove) { await api(`/api/admin/staff/${t.dataset.stMove}/move`, { method: "POST", body: { dir: Number(t.dataset.dir) } }); return renderTeam(); }
      if (t.dataset.calReset) {
        const r = await confirmBox("Generezi un link nou? Cel vechi nu va mai funcționa, iar persoana va trebui să adauge din nou calendarul.", { ok: "Generează link nou" });
        if (!r.ok) return;
        await api(`/api/admin/staff/${t.dataset.calReset}`, { method: "PATCH", body: { resetCalendar: true } });
        toast("Link nou generat."); return renderTeam();
      }
    } catch (ex) { fail(ex); }
  });
  $("#newStaffBtn").addEventListener("click", () => staffModal(null));

  function staffModal(p) {
    const cats = S.catalog.categories;
    openModal(`<form id="stForm" novalidate>
      <div class="m-head"><h2>${p ? "Editează" : "Persoană nouă în echipă"}</h2><button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button></div>
      <div class="m-body">
        <div class="grid2">
          <label class="field"><span>Nume</span><input id="stName" value="${esc(p?.name || "")}"></label>
          <label class="field"><span>Rol afișat pe site</span><input id="stRole" value="${esc(p?.role || "")}" placeholder="ex. Tehnician unghii"></label>
        </div>
        <div class="grid3">
          <label class="field"><span>Inițiale</span><input id="stInit" maxlength="3" value="${esc(p?.initials || "")}" placeholder="auto"></label>
          <label class="field"><span>Notă (opțional)</span><input id="stRating" value="${esc(p?.rating || "")}" placeholder="5.00"></label>
          <label class="field"><span>Nr. recenzii</span><input type="number" id="stReviews" min="0" value="${p?.reviews || 0}"></label>
        </div>
        <fieldset class="field" style="border:0;padding:0;margin:0"><span>Ce servicii face (poate fi programată online pentru ele)</span>
          ${cats.map((c) => `<label class="check"><input type="checkbox" name="stCat" value="${esc(c.id)}"${p?.cats.includes(c.id) ? " checked" : ""}> ${esc(c.name)}</label>`).join("")}</fieldset>
        <label class="check"><input type="checkbox" id="stActive"${!p || p.active ? " checked" : ""}> Activă (apare pe site și în calendar)</label>
        <p class="form-error" id="stErr" hidden></p>
      </div>
      <div class="m-foot"><button type="button" class="btn ghost" data-mclose>Renunță</button><button class="btn" type="submit">${p ? "Salvează" : "Adaugă în echipă"}</button></div>
    </form>`);
    $("#stForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = { name: $("#stName").value, role: $("#stRole").value, initials: $("#stInit").value, rating: $("#stRating").value,
        reviews: Number($("#stReviews").value) || 0, cats: $$("input[name=stCat]:checked").map((x) => x.value), active: $("#stActive").checked };
      try {
        if (p) await api(`/api/admin/staff/${p.id}`, { method: "PATCH", body });
        else await api("/api/admin/staff", { method: "POST", body });
        modal.close(); toast("Echipa a fost actualizată pe site."); renderTeam().catch(fail);
      } catch (ex) { $("#stErr").textContent = ex.message; $("#stErr").hidden = false; }
    });
  }

  /* ============================== Conturi ============================== */
  function applyRole() {
    const staff = isStaff();
    $$("[data-admin]").forEach((el) => { el.hidden = staff; });
    $("#myAccountBtn").hidden = !staff;
    // Pe telefon, ultimul buton din bara de jos: „Cont” pentru angajată, „Mai mult” pentru administrator
    $("#moreBtn").innerHTML = staff ? '<svg><use href="#i-team"/></svg><span>Cont</span>' : '<svg><use href="#i-more"/></svg><span>Mai mult</span>';
    $$("#app .brand .logo-sub").forEach((el) => { el.textContent = staff ? S.me.name : "panoul salonului"; });
  }

  // Administratorul creează contul, dă o parolă nouă sau oprește contul unei angajate
  async function staffAccount(id, action) {
    const p = staffById(id);
    if (action !== "create") {
      const r = await confirmBox(action === "disable"
        ? `Oprești contul lui ${p.name}? Nu mai poate intra în panou până nu îi creezi altul.`
        : `Generezi o parolă nouă pentru ${p.name}? Cea veche nu mai funcționează, iar ea este deconectată de pe toate telefoanele.`,
        { ok: action === "disable" ? "Oprește contul" : "Generează parola", danger: action === "disable" });
      if (!r.ok) return;
    }
    const r = await api(`/api/admin/staff/${id}/account`, { method: "POST", body: { action } });
    await renderTeam();
    if (action === "disable") return toast("Contul a fost oprit.");
    const msg = `Bună, ${p.name.split(" ")[0]}! Programul tău Éclat: intră pe ${r.loginUrl}, alege-ți numele și scrie parola ${r.password}. La prima intrare îți alegi o parolă nouă.`;
    openModal(`<div>
      <div class="m-head"><h2>${action === "create" ? "Cont creat" : "Parolă nouă"} · ${esc(p.name)}</h2><button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button></div>
      <div class="m-body">
        <p style="margin:0">Parola de început. O vezi doar acum:</p>
        <p class="pw-show">${esc(r.password)}</p>
        <p class="hint" style="margin:0">Trimite-i mesajul de mai jos. La prima intrare își alege singură o parolă nouă, pe care n-o mai știe nimeni altcineva.</p>
        <textarea id="accMsg" readonly rows="4">${esc(msg)}</textarea>
      </div>
      <div class="m-foot"><button type="button" class="btn ghost" data-mclose>Închide</button><button type="button" class="btn" id="accCopy">Copiază mesajul</button></div>
    </div>`);
    $("#accCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(msg); toast("Mesajul a fost copiat."); }
      catch { $("#accMsg").select(); toast("Selectat. Apasă Cmd/Ctrl + C pentru a copia."); }
    });
  }

  // Fereastră de jos cu acțiuni mari, ușor de atins cu degetul
  function sheet(title, items) {
    openModal(`<div>
      <div class="m-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button></div>
      <div class="m-body sheet-list">${items.map((it, i) => it.href
        ? `<a class="sheet-item" href="${esc(it.href)}" target="_blank" rel="noopener"><svg><use href="#${it.icon}"/></svg><span>${esc(it.label)}</span></a>`
        : `<button type="button" class="sheet-item" data-i="${i}"><svg><use href="#${it.icon}"/></svg><span>${esc(it.label)}</span></button>`).join("")}</div>
    </div>`);
    $$(".sheet-item[data-i]", modal).forEach((b) => b.addEventListener("click", () => { modal.close(); items[Number(b.dataset.i)].run(); }));
  }

  // Pe telefon: „Mai mult” (administrator) sau „Cont” (angajată) din bara de jos
  $("#moreBtn").addEventListener("click", () => {
    if (isStaff()) return openMyAccount();
    sheet("Mai mult", [
      { icon: "i-tag", label: "Servicii și prețuri", run: () => setView("services") },
      { icon: "i-team", label: "Echipă și conturi", run: () => setView("team") },
      { icon: "i-ext", label: "Vezi site-ul", href: SITE_URL },
      { icon: "i-out", label: "Ieșire", run: logout },
    ]);
  });

  // Butonul + de pe telefon
  $("#fab").addEventListener("click", () => sheet("Adaugă", [
    { icon: "i-plus", label: "Programare nouă", run: () => openNewAppt({ date: S.date }) },
    { icon: "i-cal", label: "Blochează timp (pauză, zi liberă)", run: () => openBlock({ date: S.date }) },
  ]));

  /* ============================== Telefon: lista zilei ============================== */
  // Banda cu zile: de la o săptămână în urmă până la o lună înainte
  function renderDayStrip() {
    const today = nowRO().date;
    let from = addDays(today, -7), to = addDays(today, 30);
    if (S.date < from) from = addDays(S.date, -3);
    if (S.date > to) to = addDays(S.date, 3);
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    const strip = $("#dayStrip");
    strip.innerHTML = days.map((d) => {
      const dt = dObj(d), closed = !S.salon.hours[dt.getUTCDay()];
      return `<button type="button" class="day${d === S.date ? " on" : ""}${d === today ? " today" : ""}${closed ? " closed" : ""}" data-date="${d}" role="tab" aria-selected="${d === S.date}"><small>${DSHORT[dt.getUTCDay()]}</small><b>${dt.getUTCDate()}</b></button>`;
    }).join("");
    const on = $(".day.on", strip);
    if (on) strip.scrollLeft = on.offsetLeft - strip.clientWidth / 2 + on.clientWidth / 2;
  }
  $("#dayStrip").addEventListener("click", (e) => { const b = e.target.closest(".day"); if (b) { S.date = b.dataset.date; renderCalendar().catch(fail); } });

  function agendaAppt(a, { staff = false, price = false, status = false } = {}) {
    const p = staffById(a.staff_id);
    const tags = [a.seen ? "" : '<i class="tag dark">Nouă</i>', a.first_visit ? '<i class="tag gold">Prima vizită</i>' : "",
      a.source === "website" ? '<i class="tag">Online</i>' : "", status || a.status !== "confirmed" ? statusTag(a.status, a.cancelled_by) : ""].join("");
    return `<button type="button" class="ag-item st-${a.status}${a.seen ? "" : " unseen"}" data-appt="${a.id}">
      <span class="ag-time"><b>${fmtTime(a.start_min)}</b><small>${fmtTime(a.end_min)}</small></span>
      <span class="ag-main"><b class="ag-name">${esc(a.client_name)}</b><span class="ag-svc">${esc(a.service_name)}${price ? ` · ${fmtLei(a.price_final)}` : ""}</span>
        ${staff && p ? `<span class="ag-staff"><i class="mono">${esc(p.initials)}</i>${esc(p.name)}</span>` : ""}
        ${tags ? `<span class="ag-tags">${tags}</span>` : ""}</span>
    </button>`;
  }
  function renderAgenda() {
    const { appts, blocks } = S.day;
    const all = !isStaff();
    if (all) {
      const staff = S.catalog.staff.filter((p) => p.active || appts.some((a) => a.staff_id === p.id));
      if (S.calStaff && !staff.some((p) => p.id === S.calStaff)) S.calStaff = "";
      $("#staffChips").innerHTML = [["", "Toată echipa", appts.length], ...staff.map((p) => [p.id, p.name, appts.filter((a) => a.staff_id === p.id).length])]
        .map(([id, name, n]) => `<button type="button" class="chip${S.calStaff === id ? " on" : ""}" data-staff="${esc(id)}">${esc(name)}<small>${n}</small></button>`).join("");
    } else $("#staffChips").innerHTML = "";
    const mine = (id) => !S.calStaff || id === S.calStaff;
    const items = [
      ...appts.filter((a) => mine(a.staff_id)).map((a) => ({ t: a.start_min, html: agendaAppt(a, { staff: all && !S.calStaff }) })),
      ...blocks.filter((b) => b.staff_id === "*" || mine(b.staff_id)).map((b) => ({ t: b.start_min, html: `<button type="button" class="ag-item ag-block" data-block="${b.id}">
        <span class="ag-time"><b>${fmtTime(b.start_min)}</b><small>${fmtTime(b.end_min)}</small></span>
        <span class="ag-main"><b class="ag-name">${esc(b.reason || "Timp blocat")}</b><span class="ag-svc">${esc(b.staff_id === "*" ? "Toată echipa" : staffById(b.staff_id)?.name || "")}</span></span></button>` })),
    ].sort((x, y) => x.t - y.t);
    $("#agenda").innerHTML = items.length ? items.map((x) => x.html).join("")
      : `<div class="empty ag-empty">${S.salon.hours[dowOf(S.date)] ? "Nicio programare în ziua asta." : "Salonul este închis în ziua asta."}<button type="button" class="btn small" data-add><svg><use href="#i-plus"/></svg>Programare nouă</button></div>`;
  }
  $("#agenda").addEventListener("click", (e) => {
    const a = e.target.closest("[data-appt]"); if (a) return openAppt(Number(a.dataset.appt)).catch(fail);
    const b = e.target.closest("[data-block]"); if (b) return removeBlock(Number(b.dataset.block));
    if (e.target.closest("[data-add]")) openNewAppt({ date: S.date });
  });
  $("#staffChips").addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) { S.calStaff = c.dataset.staff; renderAgenda(); } });
  function applyCalMode() {
    $('.view[data-view="calendar"]').classList.toggle("mode-grid", S.calMode === "grid");
    $$("#calMode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === S.calMode)));
  }
  $("#calMode").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.calMode = b.dataset.mode;
    try { localStorage.setItem("eclat-cal-mode", S.calMode); } catch { /* nu e critic */ }
    applyCalMode();
    if (S.calMode === "grid") drawGrid(S.day.appts, S.day.blocks, true);
  });
  phoneMQ.addEventListener("change", () => { if (!$("#app").hidden) refresh(); });

  // Lista de programări pe telefon: fișe grupate pe zile
  function renderListCards(items) {
    if (!items.length) { $("#listCards").innerHTML = '<p class="empty">Nicio programare în intervalul ales.</p>'; return; }
    const today = nowRO().date;
    let last = "", html = "";
    for (const a of items) {
      if (a.date !== last) { html += `<h3 class="m-day">${longDate(a.date)}${a.date === today ? " · azi" : ""}</h3>`; last = a.date; }
      html += agendaAppt(a, { staff: !isStaff(), price: true }); // statusul apare doar când nu e „Confirmată”
    }
    $("#listCards").innerHTML = html;
  }
  $("#filtToggle").addEventListener("click", () => {
    const f = $("#listFilters"), open = !f.classList.contains("open");
    f.classList.toggle("open", open); $("#filtToggle").setAttribute("aria-expanded", String(open));
  });

  // Angajata: linkul ei de calendar și schimbarea parolei
  $("#myAccountBtn").addEventListener("click", () => openMyAccount());
  function openMyAccount() {
    const p = staffById(S.me.staffId);
    openModal(`<div>
      <div class="m-head"><h2>Contul meu</h2><button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button></div>
      <div class="m-body">
        <p style="margin:0;font-size:17px"><b>${esc(S.me.name)}</b> · în panou vezi doar programările și clientele tale.</p>
        <div class="section-title">Programul meu în calendarul telefonului</div>
        <div class="cal-link" style="margin-top:0"><input readonly id="myCal" value="${esc(p?.calUrl || "")}" aria-label="Linkul calendarului meu"><button type="button" class="btn small" id="myCalCopy">Copiază linkul</button></div>
        <p class="hint" style="margin:0"><b>iPhone:</b> Configurări → Calendar → Conturi → Adaugă un cont → Altul → Adaugă un calendar abonat → lipește linkul. <b>Google Calendar</b> (pe calculator): Alte calendare → + → Din adresă URL → lipește linkul.</p>
      </div>
      <div class="m-foot"><button type="button" class="btn ghost" id="myLogout">Ieșire</button><button type="button" class="btn" id="myPw">Schimbă parola</button></div>
    </div>`);
    $("#myLogout").addEventListener("click", () => { modal.close(); logout(); });
    $("#myCalCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("#myCal").value); toast("Linkul a fost copiat."); }
      catch { $("#myCal").select(); toast("Selectat. Apasă Cmd/Ctrl + C pentru a copia."); }
    });
    $("#myPw").addEventListener("click", () => passwordModal(false));
  }

  // forced = prima intrare cu parola primită: fereastra nu se poate închide până nu își alege parola ei
  function passwordModal(forced) {
    openModal(`<form id="pwForm" novalidate>
      <div class="m-head"><h2>${forced ? "Alege-ți parola" : "Schimbă parola"}</h2>${forced ? "" : '<button type="button" class="icon-btn small" data-mclose aria-label="Închide"><svg><use href="#i-x"/></svg></button>'}</div>
      <div class="m-body">
        ${forced ? `<p style="margin:0;font-size:17px">Bun venit, ${esc(S.me.name.split(" ")[0])}! Înainte de a începe, alege o parolă doar a ta, de cel puțin 8 caractere.</p>` : ""}
        <label class="field"><span>${forced ? "Parola primită" : "Parola actuală"}</span><input type="password" id="pwCur" autocomplete="current-password"></label>
        <label class="field"><span>Parola nouă</span><input type="password" id="pwNew" autocomplete="new-password"></label>
        <label class="field"><span>Scrie din nou parola nouă</span><input type="password" id="pwNew2" autocomplete="new-password"></label>
        <p class="form-error" id="pwErr" hidden></p>
      </div>
      <div class="m-foot">${forced ? "" : '<button type="button" class="btn ghost" data-mclose>Renunță</button>'}<button class="btn" type="submit">Salvează parola</button></div>
    </form>`);
    modal.oncancel = forced ? (e) => e.preventDefault() : null;
    $("#pwForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#pwErr"); err.hidden = true;
      if ($("#pwNew").value !== $("#pwNew2").value) { err.textContent = "Cele două parole noi nu sunt la fel."; err.hidden = false; return; }
      try {
        await api("/api/admin/password", { method: "POST", body: { current: $("#pwCur").value, next: $("#pwNew").value } });
        S.me.mustChange = false; modal.oncancel = null; modal.close(); toast("Parola a fost schimbată.");
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
    setTimeout(() => $("#pwCur").focus(), 50);
  }

  /* ============================== Pornire ============================== */
  async function boot() {
    try {
      const me = await api("/api/admin/me");
      S.salon = me.salon; S.today = me.today.date; S.date = S.date || S.today; S.me = me.user;
      await loadCatalog();
    } catch (e) { if (e.status !== 401) fail(e); return; }
    applyRole();
    $("#login").hidden = true; $("#app").hidden = false;
    setView((location.hash || "#calendar").slice(1), false);
    if (S.me.mustChange) passwordModal(true);
  }
  setInterval(() => { if (!$("#app").hidden && S.view === "calendar" && drawer.hidden && !modal.open) renderCalendar().catch(() => {}); }, 60000);
  boot();
})();
