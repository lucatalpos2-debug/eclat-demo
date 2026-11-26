/* ÉCLAT nail salon — interacțiuni & programare online */
(() => {
  "use strict";

  /* ---------------- Configurare ---------------- */
  const CONFIG = {
    // Modul se alege singur: dacă serverul salonului răspunde la {endpoint}/health, programările sunt reale ("live");
    // altfel (ex. pagina deschisă ca fișier static) site-ul rulează în "demo", fără să trimită nimic.
    mode: "demo",
    endpoint: "/api",
    phone: "",             // ex. "+40 7xx xxx xxx" — butonul „Sună-ne” apare doar dacă e completat
    // Prima vizită se verifică după telefon. În modul "live", serverul răspunde la
    // POST {endpoint}/clients/check cu { firstVisit: true|false } (lista de cliente importată din Mero).
    // În modul "demo": numerele de mai jos + programările făcute deja din acest browser.
    demoKnownClients: ["0700000001", "0700000002"],
    // Ofertă pentru prima vizită: oprită (salonul nu are o asemenea ofertă). Se pornește cu o dată de final
    // (ex. "2026-12-31") și un procent; atunci site-ul recunoaște singur prima vizită după telefon.
    promoUntil: "",
    promoPercent: 0,
    daysAhead: 21,
    slotStep: 30,          // minute
    minLeadMinutes: 60,    // nu se pot face programări cu mai puțin de 1h înainte
    // Program: 0 = duminică … 6 = sâmbătă; [deschidere, închidere] în minute
    hours: { 0: null, 1: [480, 1200], 2: [480, 1200], 3: [480, 1200], 4: [480, 1200], 5: [480, 1200], 6: [600, 960] },
    tz: "Europe/Bucharest",
  };

  // Categoriile vin din tab-urile secțiunii Servicii (generate de server din panou)
  const cats = () => Object.fromEntries([...document.querySelectorAll(".tabs .tab")].map((t) => [t.dataset.tab, t.textContent.trim()]));
  const LIVE = { on: false, busy: {} };
  const DAY_SHORT = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];
  const DAY_LONG = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
  const MONTHS = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."];
  const MONTHS_LONG = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, "0");
  const fmtTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const fmtDur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) : ""}` : `${m} min`);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Ora curentă în România, indiferent de fusul vizitatorului */
  function nowRO() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: CONFIG.tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
    }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    const date = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
    return { date, minutes: (+p.hour % 24) * 60 + +p.minute, dow: date.getUTCDay() };
  }
  const isoDay = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const promoActive = () => !!CONFIG.promoUntil && CONFIG.promoPercent > 0 && isoDay(nowRO().date) <= CONFIG.promoUntil;

  /* ---------------- Date din pagină (sursă unică) ---------------- */
  const SERVICES = $$(".svc").map((el) => ({
    id: el.dataset.id, cat: el.dataset.cat, name: el.dataset.name,
    dur: +el.dataset.dur, price: +el.dataset.price, priceLabel: el.dataset.priceLabel,
    desc: $(".svc-desc", el)?.textContent.trim() || "",
  }));
  const STAFF = $$(".member").map((el) => ({
    id: el.dataset.staff, name: el.dataset.name, initials: el.dataset.initials,
    cats: el.dataset.cats.split(" "), role: $(".role", el).textContent,
  }));

  /* ---------------- Header, meniu, reveal ---------------- */
  const header = $("#header");
  const sticky = $("#stickyCta");
  const bookingSec = $("#programare");
  const onScroll = () => {
    header.classList.toggle("scrolled", scrollY > 10);
    const r = bookingSec.getBoundingClientRect();
    const inBooking = r.top < innerHeight * 0.6 && r.bottom > innerHeight * 0.3;
    sticky.classList.toggle("show", scrollY > innerHeight * 0.7 && !inBooking);
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const menuBtn = $("#menuBtn");
  const menu = $("#mobileMenu");
  const setMenu = (open) => {
    document.body.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", open);
    menu.setAttribute("aria-hidden", !open);
    document.body.style.overflow = open ? "hidden" : "";
  };
  menuBtn.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  $$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));

  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  // Link activ în meniu
  const navLinks = $$(".nav .navlink");
  const secObs = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-45% 0px -50% 0px" });
  ["servicii", "galerie", "echipa", "contact"].forEach((id) => secObs.observe(document.getElementById(id)));

  /* ---------------- Promo ---------------- */
  if (!promoActive()) {
    $("#promo")?.remove();
    $(".hero-badge")?.remove();
    $("#firstVisitWrap")?.remove();
  }

  /* ---------------- Tab-uri servicii ---------------- */
  const tabs = $$(".tab");
  tabs.forEach((t) => t.addEventListener("click", () => {
    tabs.forEach((x) => x.setAttribute("aria-selected", x === t));
    $$(".svc-panel").forEach((p) => p.classList.toggle("active", p.id === "p-" + t.dataset.tab));
  }));
  $(".tabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const i = tabs.indexOf(document.activeElement);
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    n.focus(); n.click();
  });

  /* ---------------- Program & status deschis ---------------- */
  (function hoursStatus() {
    const { dow, minutes } = nowRO();
    $(`#hours tr[data-day="${dow}"]`)?.classList.add("today");
    const st = $("#openStatus");
    const h = CONFIG.hours[dow];
    if (h && minutes >= h[0] && minutes < h[1]) {
      $("span", st).textContent = `Deschis acum · închidem la ${fmtTime(h[1])}`;
    } else {
      st.classList.add("closed");
      let d = dow, label = "";
      for (let i = 0; i < 8; i++) {
        const hh = CONFIG.hours[d];
        if (hh && (i > 0 || minutes < hh[0])) {
          label = i === 0 ? `azi la ${fmtTime(hh[0])}` : i === 1 ? `mâine la ${fmtTime(hh[0])}` : `${DAY_LONG[d]} la ${fmtTime(hh[0])}`;
          break;
        }
        d = (d + 1) % 7;
      }
      $("span", st).textContent = `Închis acum · deschidem ${label}`;
    }
    if (CONFIG.phone) {
      const c = $("#callBtn");
      c.hidden = false; c.href = "tel:" + CONFIG.phone.replace(/\s/g, "");
    }
    $("#year").textContent = nowRO().date.getUTCFullYear();
  })();

  /* =================================================================
     PROGRAMARE
     ================================================================= */
  const state = { step: 1, cat: "mani", svc: null, staff: null, date: null, time: null, firstVisit: null };
  const steps = $$(".step");
  const stepLis = $$(".steps li");
  const nextBtn = $("#nextBtn");
  const backBtn = $("#backBtn");

  const svcById = (id) => SERVICES.find((s) => s.id === id);
  const staffById = (id) => STAFF.find((s) => s.id === id);
  const staffFor = (svc) => STAFF.filter((p) => p.cats.includes(svc.cat));

  // Intervale ocupate: în modul live vin de la server (programări + ore blocate); în demo sunt simulate.
  function busyIntervals(staffId, day) {
    if (LIVE.on) return LIVE.busy[day]?.[staffId] || [];
    const out = [];
    for (let hr = 8; hr < 20; hr++) {
      let h = 2166136261;
      for (const c of `${staffId}|${day}|${hr}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
      if (((h >>> 0) % 100) < 34) out.push([hr * 60, hr * 60 + 60]);
    }
    return out;
  }
  function freeStaffAt(svc, day, t) {
    const pool = state.staff && state.staff !== "any" ? [staffById(state.staff)] : staffFor(svc);
    return pool.filter((p) => p && !busyIntervals(p.id, day).some(([a, b]) => t < b && t + svc.dur > a));
  }
  async function loadAvailability() {
    if (!LIVE.on) return;
    const r = await fetch(`${CONFIG.endpoint}/availability?days=${CONFIG.daysAhead}`, { cache: "no-store" });
    if (r.ok) LIVE.busy = (await r.json()).busy || {};
  }
  function slotsFor(dateObj) {
    const svc = svcById(state.svc);
    const h = CONFIG.hours[dateObj.getUTCDay()];
    if (!h || !svc) return [];
    const now = nowRO();
    const today = isoDay(dateObj) === isoDay(now.date);
    const out = [];
    for (let t = h[0]; t + svc.dur <= h[1]; t += CONFIG.slotStep) {
      const past = today && t < now.minutes + CONFIG.minLeadMinutes;
      out.push({ t, free: !past && freeStaffAt(svc, isoDay(dateObj), t).length > 0 });
    }
    return out;
  }

  /* ---- Pas 1: categorii + servicii ---- */
  function renderCats() {
    const CATS = cats();
    const allowed = state.staff && state.staff !== "any" ? staffById(state.staff).cats : Object.keys(CATS);
    if (!allowed.includes(state.cat)) state.cat = allowed.find((k) => k in CATS) || Object.keys(CATS)[0];
    $("#catChips").innerHTML = Object.entries(CATS).filter(([k]) => allowed.includes(k))
      .map(([k, v]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${k === state.cat}">${v}</button>`).join("")
      + (state.staff && state.staff !== "any"
        ? `<button type="button" class="chip" data-clear-staff aria-pressed="false">cu ${esc(staffById(state.staff).name.split(" ")[0])} ✕</button>` : "");
    renderSvcOptions();
  }
  function renderSvcOptions() {
    $("#svcOptions").innerHTML = SERVICES.filter((s) => s.cat === state.cat).map((s) => `
      <button type="button" class="opt" data-svc="${s.id}" aria-pressed="${s.id === state.svc}">
        <span class="o-name">${esc(s.name)}</span>
        <span class="o-desc">${esc(s.desc)}</span>
        <span class="o-meta"><span>${fmtDur(s.dur)}</span><b>${esc(s.priceLabel)}</b></span>
      </button>`).join("");
  }
  $("#catChips").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if ("clearStaff" in b.dataset) { state.staff = null; renderCats(); return update(); }
    state.cat = b.dataset.cat; renderCats();
  });
  $("#svcOptions").addEventListener("click", (e) => {
    const b = e.target.closest(".opt"); if (!b) return;
    state.svc = b.dataset.svc; state.time = null;
    renderSvcOptions(); update();
  });

  /* ---- Pas 2: specialiste ---- */
  function renderStaff() {
    const svc = svcById(state.svc);
    const list = staffFor(svc);
    if (state.staff && state.staff !== "any" && !list.some((p) => p.id === state.staff)) state.staff = null;
    $("#staffOptions").innerHTML = `
      <button type="button" class="opt staff-opt" data-staff-id="any" aria-pressed="${state.staff === "any"}">
        <span class="av any">✦</span><span><span class="o-name">Prima disponibilă</span><br><span class="o-meta">Cele mai multe ore libere</span></span>
      </button>` + list.map((p) => `
      <button type="button" class="opt staff-opt" data-staff-id="${p.id}" aria-pressed="${p.id === state.staff}">
        <span class="av">${esc(p.initials)}</span><span><span class="o-name">${esc(p.name)}</span><br><span class="o-meta">${esc(p.role)}</span></span>
      </button>`).join("");
  }
  $("#staffOptions").addEventListener("click", (e) => {
    const b = e.target.closest(".opt"); if (!b) return;
    state.staff = b.dataset.staffId; state.time = null;
    renderStaff(); update();
  });

  /* ---- Pas 3: zile + ore ---- */
  function days() {
    const start = nowRO().date;
    return Array.from({ length: CONFIG.daysAhead }, (_, i) => new Date(start.getTime() + i * 864e5));
  }
  function renderDates() {
    const list = days();
    if (!state.date) state.date = isoDay((list.find((d) => slotsFor(d).some((s) => s.free))) || list[0]);
    $("#dates").innerHTML = list.map((d, i) => {
      const iso = isoDay(d);
      const closed = !CONFIG.hours[d.getUTCDay()];
      const full = !closed && !slotsFor(d).some((s) => s.free);
      return `<button type="button" class="date" data-date="${iso}" aria-pressed="${iso === state.date}" ${closed || full ? "disabled" : ""}
        aria-label="${DAY_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]}${closed ? ", închis" : full ? ", complet" : ""}">
        <span class="d-w">${i === 0 ? "Azi" : i === 1 ? "Mâine" : DAY_SHORT[d.getUTCDay()]}</span>
        <span class="d-n">${d.getUTCDate()}</span><span class="d-m">${closed ? "închis" : full ? "complet" : MONTHS[d.getUTCMonth()]}</span></button>`;
    }).join("");
    renderSlots();
  }
  function renderSlots() {
    const d = new Date(state.date + "T00:00:00Z");
    const s = slotsFor(d);
    const groups = [["Dimineața", 0, 720], ["După-amiaza", 720, 1020], ["Seara", 1020, 1440]]
      .map(([label, a, b]) => [label, s.filter((x) => x.t >= a && x.t < b)]).filter(([, l]) => l.length);
    $("#slotsWrap").innerHTML = groups.length ? groups.map(([label, l]) => `
      <div class="slots-group"><span class="slots-label">${label}</span><div class="slots">
      ${l.map((x) => `<button type="button" class="slot" data-time="${x.t}" aria-pressed="${x.t === state.time}" ${x.free ? "" : "disabled"}>${fmtTime(x.t)}</button>`).join("")}
      </div></div>`).join('<div style="height:14px"></div>')
      : `<p class="empty-note">În această zi nu mai avem locuri. Alege altă zi.</p>`;
  }
  $("#dates").addEventListener("click", (e) => {
    const b = e.target.closest(".date"); if (!b || b.disabled) return;
    state.date = b.dataset.date; state.time = null;
    $$(".date").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderSlots(); update();
  });
  $("#slotsWrap").addEventListener("click", (e) => {
    const b = e.target.closest(".slot"); if (!b || b.disabled) return;
    state.time = +b.dataset.time;
    $$(".slot").forEach((x) => x.setAttribute("aria-pressed", x === b));
    update();
  });

  /* ---- Pas 4: formular ---- */
  const form = $("#detailsForm");
  const phoneOk = (v) => /^(\+?40|0040|0)7\d{8}$/.test(v.replace(/[\s.\-()]/g, "")) || /^(\+?40|0)[23]\d{8}$/.test(v.replace(/[\s.\-()]/g, ""));
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); // obligatoriu: acolo pleacă confirmarea și linkul de anulare
  function validate(show) {
    const name = $("#fName").value.trim(), phone = $("#fPhone").value.trim(), email = $("#fEmail").value.trim();
    const res = { fName: name.length >= 2, fPhone: phoneOk(phone), fEmail: emailOk(email) };
    if (show) Object.entries(res).forEach(([id, ok]) => $("#" + id).closest(".field").classList.toggle("invalid", !ok));
    return res.fName && res.fPhone && res.fEmail && $("#fGdpr").checked;
  }
  form.addEventListener("input", (e) => {
    const f = e.target.closest(".field");
    if (f?.classList.contains("invalid")) validate(true);
    if (e.target.id === "fPhone") schedulePhoneCheck();
    update();
  });

  /* ---- Prima vizită: detectată automat după telefon ---- */
  const normPhone = (v) => {
    let d = String(v).replace(/\D/g, "");
    if (d.startsWith("0040")) d = "0" + d.slice(4);
    else if (d.startsWith("40") && d.length === 11) d = "0" + d.slice(2);
    return d;
  };
  function readDemoBookings() {
    try { return JSON.parse(localStorage.getItem("eclat-demo-bookings") || "[]"); } catch { return []; }
  }
  async function checkClient(phone) {
    const norm = normPhone(phone);
    if (CONFIG.mode === "live" && CONFIG.endpoint) {
      const r = await fetch(CONFIG.endpoint + "/clients/check", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: norm }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      return { firstVisit: !!data.firstVisit };
    }
    await new Promise((res) => setTimeout(res, 550));
    const known = new Set([...CONFIG.demoKnownClients, ...readDemoBookings().map((b) => normPhone(b.phone || ""))]);
    return { firstVisit: !known.has(norm) };
  }
  const statusEl = $("#firstVisitWrap");
  function showVisitStatus(kind) {
    if (!statusEl) return;
    if (!kind) { statusEl.hidden = true; statusEl.className = "visit-status"; statusEl.innerHTML = ""; return; }
    const pct = CONFIG.promoPercent;
    const views = {
      checking: `<span class="vs-ico"></span><span>Verificăm dacă ai mai fost la noi…</span>`,
      first: `<span class="vs-ico">−${pct}%</span><span><b>Prima ta vizită la Éclat.</b> Reducerea de ${pct}% s-a aplicat automat.</span>`,
      returning: `<span class="vs-ico">♡</span><span><b>Ne bucurăm să te revedem!</b> Reducerea de ${pct}% este doar pentru prima programare.</span>`,
      error: `<span class="vs-ico">!</span><span>Nu am putut verifica acum. Reducerea pentru prima vizită se confirmă la salon.</span>`,
    };
    statusEl.className = "visit-status " + (kind === "error" ? "returning" : kind);
    statusEl.innerHTML = views[kind];
    statusEl.hidden = false;
  }
  let phoneTimer = null, lastChecked = "", pendingCheck = null;
  function schedulePhoneCheck() {
    clearTimeout(phoneTimer);
    const phone = $("#fPhone").value.trim();
    if (!promoActive() || !phoneOk(phone)) {
      state.firstVisit = null; lastChecked = ""; showVisitStatus(null); update();
      return;
    }
    if (normPhone(phone) === lastChecked) return;
    state.firstVisit = null;
    showVisitStatus("checking");
    phoneTimer = setTimeout(runPhoneCheck, 450);
  }
  function runPhoneCheck() {
    const phone = $("#fPhone").value.trim();
    const norm = normPhone(phone);
    pendingCheck = checkClient(phone)
      .then(({ firstVisit }) => {
        if (normPhone($("#fPhone").value) !== norm) return; // numărul s-a schimbat între timp
        lastChecked = norm;
        state.firstVisit = firstVisit;
        showVisitStatus(firstVisit ? "first" : "returning");
      })
      .catch(() => { state.firstVisit = false; lastChecked = norm; showVisitStatus("error"); })
      .finally(() => { pendingCheck = null; update(); });
    return pendingCheck;
  }
  async function ensurePhoneChecked() {
    if (!promoActive()) return;
    clearTimeout(phoneTimer);
    if (pendingCheck) await pendingCheck;
    if (normPhone($("#fPhone").value) !== lastChecked) await runPhoneCheck();
  }
  form.addEventListener("submit", (e) => { e.preventDefault(); nextBtn.click(); });

  /* ---- Rezumat ---- */
  function whenLabel() {
    if (!state.date || state.time == null) return null;
    const d = new Date(state.date + "T00:00:00Z");
    return `${DAY_LONG[d.getUTCDay()].replace(/^./, (c) => c.toUpperCase())}, ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} · ${fmtTime(state.time)}`;
  }
  function chosenStaffName() {
    if (!state.staff) return null;
    if (state.staff !== "any") return staffById(state.staff).name;
    if (state.time != null && state.date) {
      const free = freeStaffAt(svcById(state.svc), state.date, state.time);
      return free[0] ? `${free[0].name} (prima disponibilă)` : "Prima disponibilă";
    }
    return "Prima disponibilă";
  }
  const CAT_PHOTO = { mani: "foto/nails-video-oct28.jpg", pedi: "foto/pedi-video-oct24.jpg", med: "foto/pedi-video-oct24.jpg" };
  function swapPhoto(cat) {
    const img = $("#sumImg");
    const src = CAT_PHOTO[cat] || CAT_PHOTO.mani;
    if (!img || !src || img.getAttribute("src") === src) return;
    img.classList.add("swap");
    setTimeout(() => {
      img.onload = () => img.classList.toggle("swap", false);
      img.src = src;
    }, 250);
  }
  function renderSummary() {
    const svc = svcById(state.svc);
    swapPhoto(svc ? svc.cat : state.cat);
    const set = (id, v, empty) => { const el = $(id); el.textContent = v || empty; el.classList.toggle("muted", !v); };
    set("#sumSvc", svc && `${svc.name} · ${fmtDur(svc.dur)}`, "neales încă");
    set("#sumStaff", chosenStaffName(), "neselectată");
    set("#sumWhen", whenLabel(), "neselectată");
    const first = state.firstVisit === true && promoActive();
    if (!svc) { $("#sumPrice").textContent = "—"; $("#sumOld").textContent = ""; $("#sumDisc").textContent = ""; return; }
    const range = svc.priceLabel.match(/(\d+)(?:–(\d+))?/);
    const lo = +range[1], hi = range[2] ? +range[2] : null;
    const per = /unghie/.test(svc.priceLabel) ? " / unghie" : "";
    const f = (n) => Math.round(n * (1 - CONFIG.promoPercent / 100));
    if (first) {
      $("#sumOld").textContent = svc.priceLabel.replace(" / unghie", "");
      $("#sumPrice").textContent = (hi ? `${f(lo)}–${f(hi)}` : f(lo)) + " lei" + per;
      $("#sumDisc").textContent = `−${CONFIG.promoPercent}% prima vizită`;
    } else {
      $("#sumOld").textContent = "";
      $("#sumPrice").textContent = svc.priceLabel;
      $("#sumDisc").textContent = promoActive() && state.firstVisit === null
        ? `−${CONFIG.promoPercent}% automat dacă e prima ta vizită`
        : hi ? "în funcție de lungime / caz" : "";
    }
  }

  /* ---- Navigare între pași ---- */
  function canNext() {
    return { 1: !!state.svc, 2: !!state.staff, 3: state.time != null, 4: validate(false) }[state.step];
  }
  function go(step) {
    state.step = step;
    steps.forEach((s) => s.classList.toggle("active", +s.dataset.step === step));
    stepLis.forEach((li, i) => { li.classList.toggle("done", i + 1 < step); li.classList.toggle("current", i + 1 === step); });
    if (step === 2) renderStaff();
    if (step === 3) {
      renderDates();
      if (LIVE.on) loadAvailability().then(() => { if (state.step === 3) renderDates(); }).catch(() => {});
    }
    $("#bookerNav").style.display = step === 5 ? "none" : "";
    backBtn.hidden = step === 1;
    nextBtn.innerHTML = step === 4 ? `Confirmă programarea <svg><use href="#i-arrow"/></svg>` : `Continuă <svg><use href="#i-arrow"/></svg>`;
    update();
    const top = $("#booker").getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.5) $("#booker").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function update() { nextBtn.disabled = !canNext(); renderSummary(); }

  nextBtn.addEventListener("click", async () => {
    if (state.step < 4) return go(state.step + 1);
    if (!validate(true)) return;
    nextBtn.disabled = true; nextBtn.textContent = "Se trimite…";
    await ensurePhoneChecked();
    const payload = buildPayload();
    try {
      const res = await submitBooking(payload);
      if (res && res.id) Object.assign(payload, { staff: res.staffName, firstVisit: res.firstVisit, priceFinal: res.priceFinal });
      showDone(payload);
    } catch (err) {
      nextBtn.disabled = false;
      nextBtn.innerHTML = `Confirmă programarea <svg><use href="#i-arrow"/></svg>`;
      if (err.code === "slot_taken") {
        alert(err.message);
        state.time = null;
        await loadAvailability().catch(() => {});
        return go(3);
      }
      alert(err.message || "Nu am putut trimite programarea. Te rugăm să încerci din nou sau să ne scrii pe Instagram.");
    }
  });
  backBtn.addEventListener("click", () => go(Math.max(1, state.step - 1)));

  function buildPayload() {
    const svc = svcById(state.svc);
    const staffName = chosenStaffName();
    return {
      service: svc.name, serviceId: svc.id, duration: svc.dur, price: svc.priceLabel,
      staff: staffName, staffId: state.staff, date: state.date, time: fmtTime(state.time),
      name: $("#fName").value.trim(), phone: $("#fPhone").value.trim(), email: $("#fEmail").value.trim(),
      notes: $("#fNotes").value.trim(), firstVisit: state.firstVisit === true && promoActive(),
      createdAt: new Date().toISOString(), source: "website",
    };
  }
  async function submitBooking(payload) {
    if (CONFIG.mode === "live" && CONFIG.endpoint) {
      const body = { serviceId: payload.serviceId, staffId: payload.staffId, date: payload.date, time: payload.time,
        name: payload.name, phone: payload.phone, email: payload.email, notes: payload.notes };
      const r = await fetch(CONFIG.endpoint + "/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(data.message || "Nu am putut trimite programarea."), { code: data.error });
      return data;
    }
    await new Promise((r) => setTimeout(r, 900));
    try {
      const all = readDemoBookings();
      all.push(payload);
      localStorage.setItem("eclat-demo-bookings", JSON.stringify(all));
    } catch { /* stocare indisponibilă: demo-ul merge și fără */ }
  }

  function showDone(p) {
    $("#doneName").textContent = p.name.split(" ")[0] || "frumoaso";
    $("#doneText").textContent = `${p.service}, ${whenLabel().replace(" · ", " la ")}, cu ${p.staff.replace(" (prima disponibilă)", "")}.${p.firstVisit ? ` Reducerea de ${CONFIG.promoPercent}% pentru prima vizită este aplicată.` : ""} Te așteptăm pe Str. Lascăr Pană nr. 2, vizavi de Assoc.${CONFIG.mode === "live" ? ` Ți-am trimis confirmarea pe ${p.email}, cu linkul de anulare.` : ""}`;
    $("#demoTag").hidden = CONFIG.mode !== "demo";
    $("#icsBtn").href = icsUrl(p);
    go(5);
  }
  function icsUrl(p) {
    const [y, mo, d] = p.date.split("-").map(Number);
    const start = `${y}${pad(mo)}${pad(d)}T${p.time.replace(":", "")}00`;
    const endM = state.time + p.duration;
    const end = `${y}${pad(mo)}${pad(d)}T${pad(Math.floor(endM / 60))}${pad(endM % 60)}00`;
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Eclat Nail Salon//RO", "BEGIN:VEVENT",
      `UID:${Date.now()}@eclat`, `DTSTART;TZID=Europe/Bucharest:${start}`, `DTEND;TZID=Europe/Bucharest:${end}`,
      `SUMMARY:Éclat · ${p.service}`, `LOCATION:Str. Lascăr Pană nr. 2\\, Baia Mare`,
      `DESCRIPTION:Specialistă: ${p.staff}`, "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Programare Éclat", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }
  $("#newBooking").addEventListener("click", () => {
    Object.assign(state, { svc: null, staff: null, date: null, time: null, firstVisit: null });
    lastChecked = ""; showVisitStatus(null);
    form.reset(); $$(".field.invalid").forEach((f) => f.classList.remove("invalid"));
    renderCats(); go(1);
  });

  /* ---- Scurtături din pagină: „Rezervă” la servicii / „Programează” la echipă ---- */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-book]");
    const s = e.target.closest("[data-staff-book]");
    if (!b && !s) return;
    e.preventDefault();
    if (b) {
      const svc = svcById(b.dataset.book);
      if (state.staff && state.staff !== "any" && !staffById(state.staff).cats.includes(svc.cat)) state.staff = null;
      state.cat = svc.cat; state.svc = svc.id; state.time = null; renderCats();
      bookingSec.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => go(state.staff ? 3 : 2), 350);
    } else {
      state.staff = s.dataset.staffBook; state.time = null;
      if (state.svc && !staffById(state.staff).cats.includes(svcById(state.svc).cat)) state.svc = null;
      renderCats();
      bookingSec.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => go(state.svc ? 3 : 1), 350);
    }
  });

  /* ---------------- Nișa din hero: frunzele plantei uscate ---------------- */
  (function leaves() {
    const g = $(".still .leaves");
    if (!g) return;
    const NS = "http://www.w3.org/2000/svg";
    $$(".still .stems path").forEach((path, pi) => {
      const n = +path.dataset.leaves || 6;
      const L = path.getTotalLength();
      for (let k = 0; k < n; k++) {
        const t = 0.3 + (k / (n - 1)) * 0.7;
        const a = path.getPointAtLength(L * t);
        const b = path.getPointAtLength(Math.min(L, L * t + 1.5));
        const dir = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90;
        const side = k === n - 1 ? 0 : ((k + pi) % 2 ? 1 : -1);
        const scale = 0.7 + 0.45 * Math.sin(Math.PI * t);
        const u = document.createElementNS(NS, "use");
        u.setAttribute("href", "#leaf");
        u.setAttribute("transform", `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${(dir + side * 34).toFixed(1)}) scale(${scale.toFixed(2)})`);
        g.appendChild(u);
      }
    });
  })();

  /* ---------------- Recenzii rotative ---------------- */
  (function quotes() {
    const stage = $("#quoteStage");
    if (!stage) return;
    const items = $$(".quote", stage);
    const dots = $$(".q-nav button", stage);
    let i = 0, timer = null;
    const show = (n) => {
      i = (n + items.length) % items.length;
      items.forEach((q, k) => q.classList.toggle("active", k === i));
      dots.forEach((d, k) => d.setAttribute("aria-current", k === i));
    };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = () => { if (!reduce) { clearInterval(timer); timer = setInterval(() => show(i + 1), 6500); } };
    dots.forEach((d, k) => d.addEventListener("click", () => { show(k); start(); }));
    stage.addEventListener("mouseenter", () => clearInterval(timer));
    stage.addEventListener("mouseleave", start);
    start();
  })();

  /* ---------------- Galerie mărită ---------------- */
  (function lightbox() {
    const lb = $("#lightbox");
    if (!lb) return;
    const items = $$(".g-item");
    const img = $("#lbImg");
    const cap = $("#lbCap");
    let i = 0, lastFocus = null;
    const show = (n) => {
      i = (n + items.length) % items.length;
      const src = $("img", items[i]);
      img.src = src.src;
      img.alt = src.alt;
      cap.textContent = $("figcaption", items[i])?.textContent || "";
    };
    const open = (n) => {
      lastFocus = document.activeElement;
      show(n);
      lb.hidden = false;
      document.body.style.overflow = "hidden";
      $(".lb-close", lb).focus();
    };
    const close = () => {
      lb.hidden = true;
      document.body.style.overflow = "";
      if (lastFocus) lastFocus.focus();
    };
    items.forEach((it, n) => {
      it.tabIndex = 0;
      it.setAttribute("role", "button");
      it.setAttribute("aria-label", "Deschide fotografia: " + ($("figcaption", it)?.textContent || ""));
      it.addEventListener("click", () => open(n));
      it.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(n); } });
    });
    $(".lb-close", lb).addEventListener("click", close);
    $(".lb-prev", lb).addEventListener("click", () => show(i - 1));
    $(".lb-next", lb).addEventListener("click", () => show(i + 1));
    lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
    addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(i - 1);
      if (e.key === "ArrowRight") show(i + 1);
    });
  })();

  renderCats();
  update();

  // Serverul salonului e pornit? Atunci programările sunt reale.
  fetch(CONFIG.endpoint + "/health", { cache: "no-store" })
    .then((r) => r.ok && r.json())
    .then((d) => {
      if (d && d.ok) {
        CONFIG.mode = "live"; LIVE.on = true;
        if (state.step === 3) loadAvailability().then(renderDates);
      }
    })
    .catch(() => { /* fără server: rămâne demo */ });
})();
