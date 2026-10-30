/* 字间 · 字卡传讯（纯本地，无后端） */
(function () {
  "use strict";

  const KEY = "zijian.v1";
  const SEED = window.SEED;

  /* ---------- 基础工具 ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = () => dayKey(new Date());
  const fmtClock = (ts) => {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const dayLabel = (ts) => {
    const d = new Date(ts);
    const t = new Date();
    const k = dayKey(d);
    if (k === dayKey(t)) return "今天";
    const y = new Date(t.getTime() - 86400000);
    if (k === dayKey(y)) return "昨天";
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };
  const relTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const t = new Date();
    if (dayKey(d) === dayKey(t)) return fmtClock(ts);
    const y = new Date(t.getTime() - 86400000);
    if (dayKey(d) === dayKey(y)) return "昨天";
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const STATUSES = [
    { id: "online", label: "在线", color: "#4C7A4C" },
    { id: "offline", label: "离线", color: "#A6A69F" },
    { id: "dnd", label: "勿打扰", color: "#9B3A2E" },
    { id: "sleep", label: "睡觉", color: "#6B6B86" }
  ];
  function statusOf(c) {
    return STATUSES.find((s) => s.id === (c && c.status)) || STATUSES[0];
  }
  function isImageAvatar(v) {
    return typeof v === "string" && /^data:image\//.test(v);
  }
  function avatarInner(v) {
    return isImageAvatar(v) ? `<img src="${esc(v)}" alt="">` : esc(v || "我");
  }
  function avatarHTML(v, cls) {
    return `<span class="avatar${cls ? " " + cls : ""}">${avatarInner(v)}</span>`;
  }
  function pickImageFile(cb, maxSide) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const side = Math.max(img.width, img.height) || 1;
          const scale = Math.min(1, maxSide / side);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const cv = document.createElement("canvas");
          cv.width = w;
          cv.height = h;
          cv.getContext("2d").drawImage(img, 0, 0, w, h);
          cb(cv.toDataURL("image/jpeg", 0.72));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }
  function momentTime(ts) {
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1) return "刚刚";
    if (diff < 60) return diff + " 分钟前";
    if (diff < 1440) return Math.floor(diff / 60) + " 小时前";
    return dayLabel(ts) + " " + fmtClock(ts);
  }
  function findMoment(mid) {
    return db.moments.find((m) => m.id === mid);
  }
  function nameOfCid(cid) {
    if (cid === "me") return db.profile.name;
    const c = findContact(cid);
    return c ? c.name : "已删除的联系人";
  }

  let toastTimer = null;
  function toast(msg) {
    let el = $(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      const host = $("#phone") || document.body;
      host.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add("on"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("on");
      setTimeout(() => el.remove(), 280);
    }, 1700);
  }

  /* ---------- 数据 ---------- */
  function defaultDB() {
    return {
      v: 1,
      onboarded: false,
      profile: { name: "我", avatar: "我" },
      contacts: [],
      currentCid: null,
      publicCards: SEED.cards.map((c) => ({
        id: uid(), text: c.t, cat: c.c, personas: (c.p || []).slice()
      })),
      settings: {
        delay: "normal",
        replySec: 3,
        multi: "mid",
        proactive: true,
        muteAll: false,
        notify: false,
        letterCount: 3
      },
      wallet: { me: 520, them: 520 },
      ledger: [],
      letters: [],
      bottles: [],
      gifts: { sent: [], received: [] },
      rps: { win: 0, lose: 0, draw: 0 },
      moments: [],
      daily: { date: "", quote: "", mood: "", memo: "" },
      meta: { letterDay: "", intro: false }
    };
  }

  let db;
  try {
    const raw = localStorage.getItem(KEY);
    db = raw ? JSON.parse(raw) : null;
  } catch (e) {
    db = null;
  }
  if (!db || typeof db !== "object") db = defaultDB();
  const base = defaultDB();
  for (const k of Object.keys(base)) {
    if (db[k] === undefined) db[k] = base[k];
  }
  db.settings = Object.assign({}, base.settings, db.settings || {});
  db.wallet = Object.assign({}, base.wallet, db.wallet || {});
  db.daily = Object.assign({}, base.daily, db.daily || {});
  db.meta = Object.assign({}, base.meta, db.meta || {});
  db.gifts = Object.assign({}, base.gifts, db.gifts || {});
  if (!Array.isArray(db.publicCards) || !db.publicCards.length) {
    db.publicCards = base.publicCards;
  }
  if (!Array.isArray(db.moments)) db.moments = [];
  db.contacts.forEach((c) => {
    if (!STATUSES.some((s) => s.id === c.status)) c.status = "online";
  });

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      console.warn("保存失败", e);
    }
  }

  function findContact(cid) {
    return db.contacts.find((c) => c.id === cid);
  }
  function activeContact() {
    return findContact(db.currentCid) || db.contacts[0] || null;
  }

  /* ---------- 视图状态 ---------- */
  let route = { name: "home" };
  let ui = {
    cardsScope: "public",
    cardCat: "全部",
    cardQ: "",
    giftTab: "received",
    rpsLast: null,
    bottle: null,
    hbAmount: 13.14,
    ob: { name: "", myName: "我", avatar: "昼", persona: "zhikui", status: "online" },
    sheetAvatar: "",
    sheetPersona: "",
    sheetStatus: "online",
    sheetPersonas: [],
    mmImage: null
  };
  const replyTimers = new Map();
  const typingSet = new Set();

  function chatOpen(cid) {
    return route.name === "chat" && route.cid === cid;
  }

  function renderIfOpen(cid) {
    if (chatOpen(cid)) render();
  }

  /* ---------- 每日内容 ---------- */
  function ensureDaily() {
    const today = todayKey();
    if (db.daily.date !== today) {
      db.daily.date = today;
      db.daily.quote = pick(SEED.quotes);
      db.daily.mood = "";
      db.daily.memo = "";
      save();
    }
    if (!db.daily.quote) {
      db.daily.quote = pick(SEED.quotes);
      save();
    }
  }

  function drawCards(contact, n) {
    const pool = db.publicCards.concat(contact.cards || []);
    const viable = pool.filter(
      (c) => !c.personas || !c.personas.length || c.personas.includes(contact.persona)
    );
    if (!viable.length) return [];
    const hour = new Date().getHours();
    const cats = ["日常", "情话", "关心", "撒娇", "情绪", "提问", "心意"];
    if (hour >= 22 || hour < 6) cats.push("晚安", "晚安", "晚安");
    else if (hour < 10) cats.push("日常", "关心");
    let list = viable.filter((c) => c.cat === pick(cats));
    if (list.length < 3) list = viable;

    const picked = [];
    while (picked.length < n && list.length) {
      const rest = list.filter((c) => !picked.includes(c));
      if (!rest.length) break;
      const weights = rest.map((c) => (c.personas && c.personas.length ? 3 : 1));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let idx = 0;
      for (; idx < rest.length; idx++) {
        r -= weights[idx];
        if (r <= 0) break;
      }
      picked.push(rest[Math.min(idx, rest.length - 1)]);
    }
    return picked;
  }

  function maxReplyCount() {
    const map = { off: [0.05, 1], low: [0.2, 2], mid: [0.4, 2], high: [0.62, 3] };
    const cfg = map[db.settings.multi] || map.mid;
    let n = 1;
    if (Math.random() < cfg[0]) n = rnd(2, cfg[1]);
    return n;
  }

  function delayRange() {
    const sec = Number(db.settings.replySec);
    if (sec > 0) return [Math.max(0.5, sec * 0.8), Math.max(1, sec * 1.2)];
    const map = { fast: [1, 2], normal: [2, 4], slow: [4, 7] };
    return map[db.settings.delay] || map.normal;
  }

  /* ---------- 消息 ---------- */
  function messagePreview(m) {
    if (!m) return "还没有说过话";
    if (m.kind === "hongbao") return "[红包] " + (m.note || "恭喜发财");
    if (m.kind === "gift") return "[礼物] " + (m.name || "一份心意");
    if (m.kind === "sys") return m.text || "";
    return m.text || "";
  }

  /* ---------- 手机通知 ---------- */
  function canNotify() {
    return db.settings.notify && "Notification" in window;
  }

  function openChatById(cid) {
    const c = findContact(cid);
    if (!c) return;
    db.currentCid = c.id;
    c.unread = 0;
    c.messages.forEach((m) => {
      if (m.from === "them") m.read = true;
    });
    save();
    route = { name: "chat", cid: c.id };
    closeSheet();
    render();
  }

  function fallbackNotification(title, body, cid) {
    try {
      const n = new Notification(title, {
        body,
        tag: "zj-" + cid,
        icon: "assets/icon-192.png"
      });
      n.onclick = () => {
        window.focus();
        openChatById(cid);
        n.close();
      };
    } catch (e) {}
  }

  function notifyMessage(contact, msg) {
    if (!canNotify()) return;
    if (contact.mute || db.settings.muteAll) return;
    if (!document.hidden) return;
    const body = messagePreview(msg) || "发来一条消息";
    const opts = {
      body,
      tag: "zj-" + contact.id,
      icon: "assets/icon-192.png",
      badge: "assets/icon-192.png",
      data: { cid: contact.id }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (reg) reg.showNotification(contact.name, opts).catch(() => fallbackNotification(contact.name, body, contact.id));
          else fallbackNotification(contact.name, body, contact.id);
        })
        .catch(() => fallbackNotification(contact.name, body, contact.id));
    } else {
      fallbackNotification(contact.name, body, contact.id);
    }
  }

  function enableNotifications() {
    if (!("Notification" in window)) {
      toast("当前浏览器不支持通知");
      return;
    }
    if (db.settings.notify) {
      db.settings.notify = false;
      save();
      render();
      toast("已关闭消息通知");
      return;
    }
    Notification.requestPermission().then((perm) => {
      if (perm !== "granted") {
        toast("未获得通知权限，请在浏览器设置里允许");
        return;
      }
      db.settings.notify = true;
      save();
      render();
      toast("已开启，保持页面在后台即可收到通知");
    });
  }

  /* ---------- 语音通话 ---------- */
  let callState = null;

  function callDur(sec) {
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function callEl() {
    let el = $("#callLayer");
    if (!el) {
      el = document.createElement("div");
      el.id = "callLayer";
      el.className = "call-layer";
      ($("#phone") || document.body).appendChild(el);
    }
    return el;
  }

  function renderCall() {
    const el = $("#callLayer");
    if (!callState) {
      if (el) el.remove();
      return;
    }
    const c = findContact(callState.cid);
    if (!c) {
      endCall();
      return;
    }
    const active = callState.phase === "active";
    const sec = active ? Math.max(0, Math.floor((Date.now() - callState.startedAt) / 1000)) : 0;
    callEl().innerHTML = `<div class="call-inner">
      <div class="call-top">
        <div class="call-kind">语音通话</div>
        <div class="call-status" id="callStatus">${active ? callDur(sec) : "正在呼叫…"}</div>
      </div>
      <div class="call-mid">
        <div class="call-avatar">${avatarHTML(c.avatar, "xl")}</div>
        <div class="call-name">${esc(c.name)}</div>
        <div class="call-sub">${active ? "通话中" : "等待对方接听"}</div>
      </div>
      <div class="call-actions"><button class="call-hangup" data-act="call-hangup">挂断</button></div>
      <div class="call-foot">字间 · 通话为虚构演示，不会真的拨号</div>
    </div>`;
  }

  function startCall(cid) {
    const c = findContact(cid);
    if (!c || callState) return;
    callState = { cid: c.id, phase: "ringing", startedAt: 0, ringTimer: null, tick: null };
    renderCall();
    callState.ringTimer = setTimeout(() => {
      if (!callState) return;
      callState.phase = "active";
      callState.startedAt = Date.now();
      renderCall();
      callState.tick = setInterval(() => {
        if (!callState || callState.phase !== "active") return;
        const el = $("#callStatus");
        if (el) el.textContent = callDur(Math.max(0, Math.floor((Date.now() - callState.startedAt) / 1000)));
      }, 1000);
    }, 2600);
  }

  function endCall() {
    if (!callState) return;
    const st = callState;
    callState = null;
    clearTimeout(st.ringTimer);
    clearInterval(st.tick);
    const el = $("#callLayer");
    if (el) el.remove();
    const c = findContact(st.cid);
    if (!c) return;
    const sec = st.phase === "active" ? Math.max(1, Math.round((Date.now() - st.startedAt) / 1000)) : 0;
    const text = sec > 0 ? `语音通话 · 时长 ${callDur(sec)}` : "语音通话 · 已取消";
    addMessage(c, "sys", "sys", { text });
    if (chatOpen(c.id)) render();
  }

  function addMessage(contact, from, kind, payload, opts) {
    opts = opts || {};
    const msg = Object.assign({ id: uid(), from, kind, ts: Date.now() }, payload || {});
    if (from === "them") {
      if (!chatOpen(contact.id)) {
        contact.unread = (contact.unread || 0) + 1;
      }
      contact.messages.forEach((m) => {
        if (m.from === "me") m.readNoReply = false;
      });
    }
    contact.messages.push(msg);
    contact.lastAt = msg.ts;
    if (db.currentCid == null) db.currentCid = contact.id;
    save();
    if (from === "them") notifyMessage(contact, msg);
    if (chatOpen(contact.id)) render();
    else if (route.name === "home" || route.name === "discover" || route.name === "me") render();
    return msg;
  }

  function scheduleReply(contact) {
    if (replyTimers.has(contact.id) || typingSet.has(contact.id)) return;
    const token = uid();
    contact._token = token;
    const [lo, hi] = delayRange();
    const t = setTimeout(() => {
      replyTimers.delete(contact.id);
      const target = findContact(contact.id);
      if (!target || target._token !== token) return;
      typingSet.add(target.id);
      renderIfOpen(target.id);
      setTimeout(() => {
        const cur = findContact(contact.id);
        typingSet.delete(contact.id);
        if (!cur || cur._token !== token) return;
        const cards = drawCards(cur, maxReplyCount());
        if (!cards.length) {
          addMessage(cur, "them", "text", { text: "嗯，我在。" });
          return;
        }
        cards.forEach((card, i) => {
          setTimeout(() => {
            const c2 = findContact(contact.id);
            if (!c2 || c2._token !== token) return;
            addMessage(c2, "them", "text", { text: card.text });
          }, i * rnd(320, 820));
        });
      }, rnd(1000, 1900));
    }, rnd(lo, hi) * 1000);
    replyTimers.set(contact.id, t);
  }

  function sendUserText(text) {
    const c = findContact(route.cid || db.currentCid);
    if (!c) return;
    const t = String(text || "").trim();
    if (!t) return;
    const msg = addMessage(c, "me", "text", { text: t });
    c.draft = "";
    if (replyTimers.has(c.id)) {
      clearTimeout(replyTimers.get(c.id));
      replyTimers.delete(c.id);
    }
    c._token = null;
    typingSet.delete(c.id);
    setTimeout(() => {
      if (!findContact(c.id)) return;
      msg.readNoReply = true;
      save();
      renderIfOpen(c.id);
    }, rnd(700, 1500));
    setTimeout(() => {
      if (!findContact(c.id)) return;
      if (msg.readNoReply) {
        msg.readNoReply = false;
        save();
      }
    }, 30000);
    scheduleReply(c);
    render();
  }

  /* ---------- 页面渲染 ---------- */
  function render() {
    const app = $("#app");
    const tabbar = $("#tabbar");
    if (!db.onboarded) {
      tabbar.hidden = true;
      app.innerHTML = onboardHTML();
      return;
    }
    const prev = $(".page-scroll");
    const prevTop = prev ? prev.scrollTop : 0;

    let html = "";
    switch (route.name) {
      case "chat": html = chatHTML(); break;
      case "cards": html = cardsHTML(); break;
      case "discover": html = discoverHTML(); break;
      case "me": html = meHTML(); break;
      case "moments": html = momentsHTML(); break;
      case "letters": html = lettersHTML(); break;
      case "bottle": html = bottleHTML(); break;
      case "rps": html = rpsHTML(); break;
      case "hongbao": html = hongbaoHTML(); break;
      case "market": html = marketHTML(); break;
      case "giftbox": html = giftboxHTML(); break;
      default: html = homeHTML();
    }
    app.innerHTML = html;
    renderTabbar();

    if (route.name === "chat") {
      const box = $(".messages");
      if (box) box.scrollTop = box.scrollHeight;
    } else if (prevTop && $(".page-scroll")) {
      $(".page-scroll").scrollTop = prevTop;
    }
  }

  function renderTabbar() {
    const tabbar = $("#tabbar");
    const isSub = route.name === "chat" || ["moments", "letters", "bottle", "rps", "hongbao", "market", "giftbox"].includes(route.name);
    tabbar.hidden = isSub;
    if (isSub) return;
    const unreadContacts = db.contacts.reduce((a, c) => a + (c.unread || 0), 0);
    const unreadLetters = db.letters.filter((l) => l.from === "them" && !l.read).length;
    const tabs = [
      { id: "home", label: "桌面", icon: '<path d="M4 10.4 12 4l8 6.4V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>', badge: unreadContacts > 0 },
      { id: "cards", label: "字卡", icon: '<rect x="4.5" y="5" width="12" height="16" rx="2"/><path d="M8.5 9.5h4M8.5 13h4M17 7.5h2.5v12H8"/>', badge: false },
      { id: "discover", label: "发现", icon: '<circle cx="12" cy="12" r="8"/><path d="m15.4 8.6-2.1 4.7-4.7 2.1 2.1-4.7z"/>', badge: unreadLetters > 0 },
      { id: "me", label: "我的", icon: '<circle cx="12" cy="8.4" r="3.4"/><path d="M5.2 20c0-3.4 3-5.4 6.8-5.4s6.8 2 6.8 5.4"/>', badge: false }
    ];
    tabbar.innerHTML = tabs
      .map((t) => {
        const on = route.name === t.id || (t.id === "home" && ["letters", "bottle", "rps", "hongbao", "market", "giftbox"].includes(route.name));
        return `<button class="tab ${on ? "on" : ""}" data-act="tab" data-tab="${t.id}">
          <svg viewBox="0 0 24 24">${t.icon}</svg><span>${t.label}</span>
          ${t.badge ? '<i class="tab-badge"></i>' : ""}
        </button>`;
      })
      .join("");
  }

  /* ---------- 首次进入 ---------- */
  function onboardHTML() {
    const avatars = SEED.avatarChars
      .map((ch) => `<button class="avatar-opt ${ui.ob.avatar === ch ? "on" : ""}" data-act="ob-avatar" data-val="${ch}">${ch}</button>`)
      .join("");
    const personas = SEED.personas
      .map((p) => `<button class="persona ${ui.ob.persona === p.id ? "on" : ""}" data-act="ob-persona" data-val="${p.id}"><b>${p.name}</b><span>${p.desc}</span></button>`)
      .join("");
    return `<div class="onboard">
      <div class="ob-mark">字间</div>
      <div class="ob-sub">一字一句，都留在这里</div>
      <div class="ob-rule"></div>
      <div class="ob-step">01 / 先给 TA 一个名字</div>
      <input class="ob-input" id="obName" placeholder="比如：阿昼" maxlength="12" value="${esc(ui.ob.name)}">
      <div class="ob-label">选一个头像，也可以上传图片</div>
      <div class="avatar-picker">${avatars}</div>
      ${avatarUploadHTML("ob")}
      <div class="ob-label">TA 的初始状态</div>
      <div class="status-picker">${statusOptionsHTML(ui.ob.status, "ob-status")}</div>
      <div class="ob-label">TA 的性格（影响回复语气）</div>
      <div class="persona-grid">${personas}</div>
      <div class="ob-label">你自己的名字</div>
      <input class="ob-input" id="obMyName" maxlength="12" value="${esc(ui.ob.myName)}">
      <div class="ob-foot">
        <button class="solid-btn" data-act="ob-start" style="width:100%;padding:13px 0;font-size:14px">开始使用</button>
        <div class="ob-tip">纯本地存储，数据只留在这台设备。<br>定期到「我的 - 导出备份」保存一份。</div>
      </div>
    </div>`;
  }

  function startApp() {
    const nameInput = $("#obName");
    const myInput = $("#obMyName");
    const name = (nameInput && nameInput.value.trim()) || "阿昼";
    const myName = (myInput && myInput.value.trim()) || "我";
    const greeting = {
      zhikui: `我是${name}。我不绕弯子，以后就直接跟你说话了。`,
      nianren: `我是${name}。你要常来找我，不然我会一直等。`,
      badao: `我是${name}。以后有事直接说，别自己扛。`,
      huanshi: `我是${name}。你会一直在这里吗？`,
      mingan: `我是${name}。如果我哪里说得不对，你要告诉我。`,
      furuan: `我是${name}。我嘴笨，说错了你多担待。`
    }[ui.ob.persona] || `你好，我是${name}。`;

    const c = {
      id: uid(),
      name,
      avatar: ui.ob.avatar,
      persona: ui.ob.persona,
      status: ui.ob.status,
      cards: [],
      messages: [],
      unread: 0,
      mute: false,
      pinned: false,
      draft: "",
      lastAt: Date.now(),
      createdAt: Date.now()
    };
    c.messages.push({ id: uid(), from: "them", kind: "text", text: greeting, ts: Date.now() });
    db.profile.name = myName;
    db.profile.avatar = myName.slice(0, 1) || "我";
    db.contacts.push(c);
    db.currentCid = c.id;
    db.onboarded = true;
    save();
    route = { name: "home" };
    render();
    maybeDailyLetters();
    setTimeout(() => toast("字卡库已内置 " + db.publicCards.length + " 张，去「字卡」看看"), 900);
  }

  /* ---------- 桌面 ---------- */
  function homeHTML() {
    ensureDaily();
    const now = new Date();
    const moods = ["很好", "一般", "有点累", "不开心"];
    const contacts = db.contacts
      .slice()
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.lastAt || 0) - (a.lastAt || 0));
    const list = contacts.length
      ? contacts.map(contactRowHTML).join("")
      : `<div class="empty-note">还没有联系人。<br>先给一个名字，再开始说话。</div>`;

    return `<div class="page">
      <div class="topbar">
        <div><div class="tb-title">桌面</div><div class="tb-sub">本地 · ${db.contacts.length} 位联系人</div></div>
        <div class="spacer"></div>
        <button class="icon-btn add-contact-btn" data-act="add-contact" title="新建联系人">＋</button>
      </div>
      <div class="page-scroll">
        <div class="home-head">
          <div class="home-date">${now.getFullYear()} · ${pad(now.getMonth() + 1)} · ${pad(now.getDate())}</div>
          <div class="home-day">星期${["日", "一", "二", "三", "四", "五", "六"][now.getDay()]}</div>
          <div class="home-time">${fmtClock(now.getTime())} · 本地时间</div>
        </div>
        <div class="quote-card">
          <div class="quote-label">今日情话</div>
          <div class="quote-text">${esc(db.daily.quote)}</div>
          <div class="quote-foot"><span>${now.getMonth() + 1}月${now.getDate()}日</span><span>随机 · 本地</span></div>
        </div>
        <div class="mood-row">
          ${moods.map((m) => `<button class="mood-chip ${db.daily.mood === m ? "on" : ""}" data-act="mood" data-val="${m}">${m}</button>`).join("")}
        </div>
        <div class="memo-card">
          <div class="memo-label"><span>今日备忘</span><span>自动保存</span></div>
          <textarea class="memo-input" id="memoInput" placeholder="今天想记下什么…" maxlength="300">${esc(db.daily.memo)}</textarea>
        </div>
        <div class="list-head"><h2>联系人</h2><span>${db.contacts.length} 位</span></div>
        ${list}
      </div>
    </div>`;
  }

  function contactRowHTML(c) {
    const last = c.messages[c.messages.length - 1];
    const unread = c.unread || 0;
    const muted = c.mute || db.settings.muteAll;
    const badge = unread > 0 ? (muted ? '<i class="dot"></i>' : `<span class="badge">${unread > 99 ? "99+" : unread}</span>`) : "";
    return `<div class="contact-row" data-act="chat" data-cid="${c.id}">
      ${avatarHTML(c.avatar)}
      <div class="c-main">
        <div class="c-name">${esc(c.name)}<span class="tag">${personaName(c.persona)}</span></div>
        <div class="c-prev">${esc(messagePreview(last))}</div>
      </div>
      <div class="c-side"><span class="c-time">${relTime(c.lastAt)}</span>${badge}</div>
    </div>`;
  }

  function personaName(id) {
    const p = SEED.personas.find((x) => x.id === id);
    return p ? p.name : "通用";
  }

  /* ---------- 聊天 ---------- */
  function chatHTML() {
    const c = findContact(route.cid);
    if (!c) {
      route = { name: "home" };
      return homeHTML();
    }
    const msgs = c.messages || [];
    let body = "";
    let lastDay = "";
    for (const m of msgs) {
      const k = dayKey(new Date(m.ts));
      if (k !== lastDay) {
        body += `<div class="day-divider">${dayLabel(m.ts)}</div>`;
        lastDay = k;
      }
      body += messageHTML(m, c);
    }
    if (typingSet.has(c.id)) {
      body += `<div class="msg-row them">${avatarHTML(c.avatar, "sm")}<div class="msg-wrap"><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div></div>`;
    }
    if (!msgs.length) {
      body += `<div class="empty-note">还没有消息。<br>说点什么，TA 会从字卡里挑一句回你。</div>`;
    }
    const st = statusOf(c);
    const status = typingSet.has(c.id)
      ? "正在输入…"
      : `<span class="status-dot" style="background:${st.color}"></span>${st.label}`;
    return `<div class="page">
      <div class="chat-head">
        <button class="icon-btn" data-act="back"><svg viewBox="0 0 24 24"><path d="m14.5 5.5-6 6.5 6 6.5"/></svg></button>
        <div class="chat-title"><div class="nm">${esc(c.name)}</div><div class="st">${status}</div></div>
        <button class="icon-btn" data-act="call" data-cid="${c.id}" aria-label="语音通话"><svg viewBox="0 0 24 24"><path d="M6.6 4.6h2.8l1.4 3.8-1.9 1.4c.8 1.9 2.3 3.4 4.2 4.2l1.4-1.9 3.8 1.4v2.8c0 1-.8 1.7-1.8 1.6-6.5-.6-11.3-5.4-11.9-11.9-.1-1 .6-1.8 1.6-1.8Z"/></svg></button>
        <button class="icon-btn" data-act="contact-info" data-cid="${c.id}"><svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></svg></button>
      </div>
      <div class="messages" id="messages">${body}</div>
      <div class="composer">
        <button class="plus-btn" data-act="plus" data-cid="${c.id}">＋</button>
        <input id="chatInput" placeholder="说点什么…" value="${esc(c.draft || "")}" maxlength="200">
        <button class="send-btn" data-act="send" data-cid="${c.id}"><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
      </div>
    </div>`;
  }

  function messageHTML(m, c) {
    if (m.kind === "sys") return `<div class="msg-sys">${esc(m.text)}</div>`;
    let bubble;
    if (m.kind === "hongbao") {
      bubble = `<div class="bubble hongbao" data-act="hb-open" data-mid="${m.id}">
        <div class="hb-top"><span class="hb-coin">¥</span><span class="hb-name">${m.claimed ? "红包已领取" : "给你一个红包"}</span></div>
        <div class="hb-body"><div class="hb-amt"><small>¥</small>${Number(m.amount).toFixed(2)}</div><div class="hb-note">${esc(m.note || "恭喜发财，大吉大利")}</div></div>
      </div>`;
    } else if (m.kind === "gift") {
      bubble = `<div class="bubble gift-bubble">
        <div class="gift-top"><span class="gift-icon">${esc(m.icon || "礼")}</span><div class="gift-info"><div class="gift-name">${esc(m.name)}</div><div class="gift-sub">${m.from === "me" ? "你送出的心意" : "TA 送你的心意"} · ¥${Number(m.price || 0).toFixed(2)}</div></div></div>
        ${m.note ? `<div class="gift-note">${esc(m.note)}</div>` : ""}
      </div>`;
    } else {
      bubble = `<div class="bubble">${esc(m.text)}</div>`;
    }
    const av = avatarHTML(m.from === "me" ? db.profile.avatar : (c ? c.avatar : "?"), "sm");
    const wrap = `<div class="msg-wrap">${bubble}<div class="msg-meta">${fmtClock(m.ts)}${m.from === "me" && m.readNoReply ? '<span class="read-flag">已读未回</span>' : ""}</div></div>`;
    return `<div class="msg-row ${m.from}" id="msg-${m.id}">${m.from === "me" ? wrap + av : av + wrap}</div>`;
  }

  /* ---------- 字卡库 ---------- */
  function cardsForScope() {
    if (ui.cardsScope === "private") {
      const c = activeContact();
      return c ? c.cards : [];
    }
    return db.publicCards;
  }

  function cardsHTML() {
    const scope = ui.cardsScope;
    const c = activeContact();
    const cards = cardsForScope();
    const titleSub = scope === "private" ? (c ? c.name + " 的专属字卡" : "还没有联系人") : "所有联系人共用";
    return `<div class="page">
      <div class="topbar"><div><div class="tb-title">字卡库</div><div class="tb-sub">${esc(titleSub)}</div></div><div class="spacer"></div><button class="ghost-btn" data-act="cards-add">＋ 添加</button></div>
      <div class="page-scroll">
        <div class="seg">
          <button class="${scope === "public" ? "on" : ""}" data-act="cards-scope" data-val="public">公用 ${db.publicCards.length}</button>
          <button class="${scope === "private" ? "on" : ""}" data-act="cards-scope" data-val="private">专属 ${c ? (c.cards || []).length : 0}</button>
        </div>
        <div class="search-box"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><input id="cardSearch" placeholder="搜一张字卡…" value="${esc(ui.cardQ)}"></div>
        <div class="chips">${["全部"].concat(SEED.categories).map((cat) => `<button class="chip ${ui.cardCat === cat ? "on" : ""}" data-act="cards-cat" data-val="${cat}">${cat}</button>`).join("")}</div>
        <div id="cardList">${cardListHTML(cards)}</div>
        <div class="card-foot">
          <button class="ghost-btn" data-act="cards-import">导入字卡</button>
          <button class="ghost-btn" data-act="cards-export">导出字卡</button>
          <button class="ghost-btn" data-act="cards-dedupe">去重</button>
        </div>
      </div>
    </div>`;
  }

  function cardListHTML(cards) {
    const q = ui.cardQ.trim();
    let list = cards.filter((c) => (ui.cardCat === "全部" || c.cat === ui.cardCat) && (!q || c.text.includes(q)));
    if (!ui.cardsScope || (ui.cardsScope === "private" && !activeContact())) {
      return `<div class="empty-note">专属字卡属于某一位联系人。<br>先去「桌面」新建一位。</div>`;
    }
    if (!list.length) {
      return `<div class="empty-note">${cards.length ? "没有匹配的字卡。" : "这里还是空的，添加第一张字卡吧。"}</div>`;
    }
    const groups = {};
    for (const c of list) {
      const k = c.cat || "其他";
      (groups[k] = groups[k] || []).push(c);
    }
    const order = SEED.categories.filter((x) => groups[x]);
    const extra = Object.keys(groups).filter((x) => !SEED.categories.includes(x));
    const keys = order.concat(extra);
    return keys
      .map(
        (k) => `<div class="card-section">${k} · ${groups[k].length}</div>${groups[k]
          .map(
            (c) => `<div class="card-row">
              <div class="card-body">
                <div class="card-text">${esc(c.text)}</div>
                <div class="card-meta"><span class="tag">${esc(c.cat || "其他")}</span>${(c.personas || []).map((p) => `<span class="tag">${personaName(p)}</span>`).join("") || '<span class="tag">通用</span>'}</div>
              </div>
              <button class="card-del" data-act="card-del" data-id="${c.id}">×</button>
            </div>`
          )
          .join("")}`
      )
      .join("");
  }

  function refreshCardList() {
    const el = $("#cardList");
    if (el) el.innerHTML = cardListHTML(cardsForScope());
  }

  function normalizeCard(raw) {
    if (typeof raw === "string") {
      return { text: raw.trim(), cat: "日常", personas: [] };
    }
    if (raw && typeof raw === "object") {
      const text = (raw.text || raw.t || raw.content || "").trim();
      if (!text) return null;
      return {
        text,
        cat: raw.cat || raw.c || "日常",
        personas: Array.isArray(raw.personas) ? raw.personas : Array.isArray(raw.p) ? raw.p : []
      };
    }
    return null;
  }

  function addCards(cards, scope) {
    const target = scope === "private" ? (activeContact() ? activeContact().cards : null) : db.publicCards;
    if (!target) return 0;
    const existing = new Set(target.map((c) => c.text));
    let added = 0;
    for (const raw of cards) {
      const n = normalizeCard(raw);
      if (!n || existing.has(n.text)) continue;
      target.push({ id: uid(), text: n.text, cat: n.cat, personas: n.personas });
      existing.add(n.text);
      added++;
    }
    if (added) save();
    return added;
  }

  function dedupeCards() {
    const target = ui.cardsScope === "private" ? (activeContact() ? activeContact().cards : null) : db.publicCards;
    if (!target) return 0;
    const seen = new Set();
    const before = target.length;
    const kept = target.filter((c) => {
      if (seen.has(c.text)) return false;
      seen.add(c.text);
      return true;
    });
    if (ui.cardsScope === "private") {
      activeContact().cards = kept;
    } else {
      db.publicCards = kept;
    }
    save();
    return before - kept.length;
  }

  /* ---------- 发现 ---------- */
  function discoverHTML() {
    const unreadLetters = db.letters.filter((l) => l.from === "them" && !l.read).length;
    const entries = [
      { act: "open-moments", icon: "圈", name: "朋友圈", desc: "发一条动态，看看 TA 会不会点赞", side: db.moments.length ? `${db.moments.length} 条` : "" },
      { act: "open-letters", icon: "信", name: "信件", desc: "TA 偶尔会写一封信，内容取自字卡", side: unreadLetters ? `<span class="mini-badge"></span>` : "" },
      { act: "open-bottle", icon: "瓶", name: "漂流瓶", desc: "捡一个陌生人的瓶子，或写一个扔出去", side: db.bottles.length ? `${db.bottles.length} 个` : "" },
      { act: "open-rps", icon: "拳", name: "猜拳", desc: "石头剪刀布，输的人说句软话", side: `${db.rps.win}胜 ${db.rps.lose}负` },
      { act: "open-hongbao", icon: "账", name: "心意账本", desc: "我的 ¥" + db.wallet.me.toFixed(2) + " · TA 的 ¥" + db.wallet.them.toFixed(2), side: "" },
      { act: "open-market", icon: "礼", name: "礼物市集", desc: "挑一件小东西，写上留言送出去", side: "" },
      { act: "open-giftbox", icon: "柜", name: "心意柜", desc: "收到与送出的礼物都收在这里", side: `${db.gifts.received.length + db.gifts.sent.length} 件` }
    ];
    return `<div class="page">
      <div class="topbar"><div><div class="tb-title">发现</div><div class="tb-sub">慢慢来，不着急</div></div></div>
      <div class="page-scroll">
        ${entries.map((e) => `<div class="entry-row" data-act="${e.act}">
          <span class="entry-icon">${e.icon}</span>
          <div class="entry-main"><div class="entry-name">${e.name}</div><div class="entry-desc">${e.desc}</div></div>
          <div class="entry-side">${e.side}</div>
        </div>`).join("")}
        <div class="empty-note" style="margin-top:26px">所有内容都保存在本机。<br>换设备前记得导出备份。</div>
      </div>
    </div>`;
  }

  /* ---------- 朋友圈 ---------- */
  function ensureMoments() {
    if (db.moments.length) return;
    const c = activeContact();
    if (!c) return;
    const card = drawCards(c, 1)[0];
    db.moments.push({
      id: uid(),
      cid: c.id,
      text: card ? card.text : "今天想在这里留一句。",
      image: null,
      ts: Date.now() - rnd(1, 6) * 3600 * 1000,
      likes: [],
      comments: []
    });
    save();
  }

  function momentOwner(m) {
    if (m.cid === "me") return { name: db.profile.name, avatar: db.profile.avatar };
    const c = findContact(m.cid);
    return c ? { name: c.name, avatar: c.avatar } : { name: "已删除的联系人", avatar: "?" };
  }

  function momentHTML(m) {
    const o = momentOwner(m);
    const isMine = m.cid === "me";
    const liked = (m.likes || []).includes("me");
    const comments = (m.comments || [])
      .map((cm) => `<div class="m-comment"><b>${esc(nameOfCid(cm.by))}</b>：${esc(cm.text)}</div>`)
      .join("");
    return `<div class="moment">
      ${avatarHTML(o.avatar)}
      <div class="m-body">
        <div class="m-name">${esc(o.name)}</div>
        <div class="m-text">${esc(m.text || "")}</div>
        ${m.image ? `<img class="m-img" src="${esc(m.image)}" alt="动态图片">` : ""}
        <div class="m-time">${momentTime(m.ts)}</div>
        <div class="m-actions">
          <button class="${liked ? "on" : ""}" data-act="moment-like" data-mid="${m.id}">${liked ? "♥" : "♡"} ${(m.likes || []).length || ""}</button>
          <button data-act="moment-comment" data-mid="${m.id}">评论 ${(m.comments || []).length || ""}</button>
          ${isMine ? `<button class="m-del" data-act="moment-del" data-mid="${m.id}">删除</button>` : ""}
        </div>
        ${comments ? `<div class="m-comments">${comments}</div>` : ""}
      </div>
    </div>`;
  }

  function momentsHTML() {
    ensureMoments();
    const list = db.moments.slice().sort((a, b) => b.ts - a.ts);
    return `<div class="page">
      <div class="sub-head"><button class="icon-btn" data-act="back"><svg viewBox="0 0 24 24"><path d="m14.5 5.5-6 6.5 6 6.5"/></svg></button><h1>朋友圈</h1><button class="ghost-btn" data-act="moment-publish">发动态</button></div>
      <div class="page-scroll">
        <div class="moments-cover">
          <div class="mc-mark">字间</div>
          <div class="mc-sub">${esc(db.profile.name)} 的朋友圈</div>
          <span class="mc-avatar">${avatarHTML(db.profile.avatar, "xl")}</span>
        </div>
        <div class="moments-feed">
          ${list.length ? list.map(momentHTML).join("") : `<div class="empty-note">还没有动态。<br>发一条，TA 会看见。</div>`}
        </div>
      </div>
    </div>`;
  }

  function openMomentPublish() {
    ui.mmImage = null;
    openSheet(`<div class="sheet-title"><span>发一条动态</span><button class="x" data-close-sheet>×</button></div>
      <div class="field"><label>说点什么</label><textarea id="mmText" maxlength="180" placeholder="这一刻的想法…"></textarea></div>
      <div class="field"><label>配图（可选）</label>
        <div class="moment-upload">
          <div id="mmPreview" class="moment-upload-preview"></div>
          <div style="display:flex;gap:8px">
            <button class="ghost-btn" data-act="mm-image">添加图片</button>
            <button class="ghost-btn" data-act="mm-image-clear" id="mmClear" hidden>移除</button>
          </div>
        </div>
      </div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="mmPublish">发布</button></div>`);
    $("#mmPublish").onclick = () => {
      const text = $("#mmText").value.trim();
      if (!text && !ui.mmImage) { toast("写点什么，或放一张图"); return; }
      const m = { id: uid(), cid: "me", text, image: ui.mmImage, ts: Date.now(), likes: [], comments: [] };
      db.moments.push(m);
      save();
      closeSheet();
      route = { name: "moments" };
      render();
      reactToMyMoment(m.id);
      toast("已发布");
    };
  }

  function reactToMyMoment(mid) {
    const c = activeContact();
    if (!c) return;
    setTimeout(() => {
      const m = findMoment(mid);
      if (!m) return;
      if (!m.likes.includes(c.id)) {
        m.likes.push(c.id);
        save();
        if (route.name === "moments") render();
      }
    }, rnd(2, 6) * 1000);
    if (Math.random() < 0.7) {
      setTimeout(() => {
        const m = findMoment(mid);
        if (!m) return;
        const card = drawCards(c, 1)[0];
        m.comments.push({ id: uid(), by: c.id, text: card ? card.text : "看到了。", ts: Date.now() });
        save();
        if (route.name === "moments") render();
      }, rnd(8, 16) * 1000);
    }
  }

  function openMomentComment(mid) {
    const m = findMoment(mid);
    if (!m) return;
    openSheet(`<div class="sheet-title"><span>评论</span><button class="x" data-close-sheet>×</button></div>
      <p class="sheet-note">${esc((m.text || "").slice(0, 50) || "一条图片动态")}</p>
      <div class="field"><label>写一句</label><input type="text" id="mcText" maxlength="80" placeholder="说点什么…"></div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="mcSend">发送</button></div>`);
    setTimeout(() => { const el = $("#mcText"); if (el) el.focus(); }, 120);
    $("#mcSend").onclick = () => {
      const text = $("#mcText").value.trim();
      if (!text) { toast("先写一句"); return; }
      const cur = findMoment(mid);
      if (!cur) return;
      cur.comments.push({ id: uid(), by: "me", text, ts: Date.now() });
      save();
      closeSheet();
      if (route.name === "moments") render();
      const owner = cur.cid;
      if (owner !== "me") {
        setTimeout(() => {
          const c = findContact(owner);
          const m2 = findMoment(mid);
          if (!c || !m2) return;
          const card = drawCards(c, 1)[0];
          m2.comments.push({ id: uid(), by: c.id, text: card ? card.text : "嗯，看到了。", ts: Date.now() });
          save();
          if (route.name === "moments") render();
        }, rnd(2, 6) * 1000);
      }
    };
  }

  /* ---------- 信件 ---------- */
  function lettersHTML() {
    const list = db.letters.slice().sort((a, b) => b.ts - a.ts);
    return `<div class="page">
      <div class="sub-head"><button class="icon-btn" data-act="back"><svg viewBox="0 0 24 24"><path d="m14.5 5.5-6 6.5 6 6.5"/></svg></button><h1>信件</h1><button class="ghost-btn" data-act="letter-write">写一封信</button></div>
      <div class="page-scroll">
        ${list.length ? list.map(letterRowHTML).join("") : `<div class="empty-note">还没有信。<br>TA 有时会写，你也可以先写一封。</div>`}
      </div>
    </div>`;
  }

  function letterRowHTML(l) {
    const c = findContact(l.cid);
    const name = c ? c.name : "TA";
    const title = l.from === "me" ? `我写给 ${name}` : `来自 ${name}`;
    const first = (l.text || "").split("\n").filter(Boolean)[0] || "";
    const unread = l.from === "them" && !l.read;
    return `<div class="letter-row" data-act="letter-open" data-id="${l.id}">
      <div class="lr-main">
        <div class="lr-title">${esc(title)}${unread ? '<span class="mini-badge"></span>' : ""}</div>
        <div class="lr-prev">${esc(first)}</div>
        <div class="lr-time">${dayLabel(l.ts)} · ${fmtClock(l.ts)}</div>
      </div>
    </div>`;
  }

  function openLetter(id) {
    const l = db.letters.find((x) => x.id === id);
    if (!l) return;
    if (l.from === "them" && !l.read) {
      l.read = true;
      save();
      render();
    }
    const c = findContact(l.cid);
    const sign = l.from === "me" ? "——" + db.profile.name : "——" + (c ? c.name : "TA");
    openSheet(`<div class="sheet-title"><span>${l.from === "me" ? "我写的信" : "一封信"}</span><button class="x" data-close-sheet>×</button></div>
      <div class="paper">
        <div class="p-salute">${esc((c ? c.name : "你") + " 亲启")}</div>
        <div class="p-body">${esc(l.text)}</div>
        <div class="p-sign">${esc(sign)}</div>
      </div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>合上</button><button class="solid-btn" data-act="letter-reply" data-cid="${l.cid}">回一封信</button></div>`);
  }

  function maybeDailyLetters() {
    const today = todayKey();
    if (db.meta.letterDay === today) return;
    db.meta.letterDay = today;
    let created = false;
    for (const c of db.contacts) {
      if (Math.random() < 0.3) {
        const cards = drawCards(c, Math.max(1, Number(db.settings.letterCount) || 3)).map((x) => x.text);
        const body = cards.concat([pick(SEED.letterCards)]).join("\n\n");
        db.letters.push({ id: uid(), cid: c.id, from: "them", text: body, ts: Date.now(), read: false });
        created = true;
      }
    }
    if (created) {
      save();
      if (route.name === "letters") render();
    }
  }

  function openLetterWrite(cid) {
    const cs = db.contacts;
    if (!cs.length) { toast("还没有联系人"); return; }
    const target = cid || db.currentCid || cs[0].id;
    openSheet(`<div class="sheet-title"><span>写一封信</span><button class="x" data-close-sheet>×</button></div>
      <div class="field"><label>寄给</label><select id="letterTo">${cs.map((c) => `<option value="${c.id}" ${c.id === target ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      <div class="field"><label>正文</label><textarea id="letterText" placeholder="见字如面…" maxlength="600"></textarea></div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="letterSend">寄出</button></div>`);
    $("#letterSend").onclick = () => {
      const text = $("#letterText").value.trim();
      const to = $("#letterTo").value;
      if (!text) { toast("先写点内容"); return; }
      db.letters.push({ id: uid(), cid: to, from: "me", text, ts: Date.now(), read: true });
      save();
      closeSheet();
      toast("信已寄出");
      if (route.name === "letters") render();
      const c = findContact(to);
      if (!c) return;
      setTimeout(() => {
        if (!findContact(to)) return;
        const cards = drawCards(c, Math.max(1, Number(db.settings.letterCount) || 3)).map((x) => x.text);
        const body = (cards.length ? cards.join("\n\n") : "") + "\n\n" + pick(SEED.letterCards);
        db.letters.push({ id: uid(), cid: to, from: "them", text: body.trim(), ts: Date.now(), read: false });
        save();
        render();
        if (Math.random() < 0.5 && !chatOpen(to)) toast(`${c.name} 回了一封信`);
      }, rnd(4, 10) * 1000);
    };
  }

  /* ---------- 漂流瓶 ---------- */
  function bottleHTML() {
    const b = ui.bottle;
    const mine = db.bottles.slice().sort((a, b) => b.ts - a.ts);
    return `<div class="page">
      <div class="sub-head"><button class="icon-btn" data-act="back"><svg viewBox="0 0 24 24"><path d="m14.5 5.5-6 6.5 6 6.5"/></svg></button><h1>漂流瓶</h1><button class="ghost-btn" data-act="bottle-write">扔一个</button></div>
      <div class="page-scroll">
        <div class="empty-note">海很大，瓶子很慢。<br>捡到的每句话，都是别人的某一刻。</div>
        <div class="sheet-actions" style="margin-top:16px"><button class="solid-btn" data-act="bottle-pick">捡一个瓶子</button></div>
        ${b ? `<div class="bottle-card"><div class="bottle-cap">瓶中信</div><div class="bottle-text">${esc(b.text)}</div><div class="bottle-from">来自 ${esc(b.from)}</div></div>` : ""}
        <div class="list-head"><h2>我的瓶子</h2><span>${mine.length} 个</span></div>
        ${mine.length ? mine.map((x) => `<div class="card-row"><div class="card-body"><div class="card-text" style="font-size:13.5px">${esc(x.text)}</div><div class="card-meta"><span class="tag">${dayLabel(x.ts)} · ${fmtClock(x.ts)}</span></div></div></div>`).join("") : `<div class="empty-note">你还没有扔过瓶子。</div>`}
      </div>
    </div>`;
  }

  function pickBottle() {
    const c = activeContact();
    if (c && Math.random() < 0.16) {
      const card = drawCards(c, 1)[0];
      if (card) {
        ui.bottle = { text: card.text, from: c.name + "（漂流瓶）" };
        render();
        return;
      }
    }
    ui.bottle = pick(SEED.bottles);
    render();
  }

  /* ---------- 猜拳 ---------- */
  function rpsHTML() {
    const moves = [{ id: "rock", name: "石头", ch: "石" }, { id: "scissors", name: "剪刀", ch: "剪" }, { id: "paper", name: "布", ch: "布" }];
    const r = ui.rpsLast;
    const resultBox = r
      ? `<div class="rps-result"><div class="rr-main">${r.label}</div><div class="rr-sub">你出 ${r.me}，TA 出 ${r.ta}<br>${esc(r.line)}</div>
          <div class="rps-score"><span>胜<b>${db.rps.win}</b></span><span>负<b>${db.rps.lose}</b></span><span>平<b>${db.rps.draw}</b></span></div></div>`
      : `<div class="rps-result"><div class="rr-main">石头 · 剪刀 · 布</div><div class="rr-sub">选一个，TA 会随机应战。<br>输的人要说一句软话。</div>
          <div class="rps-score"><span>胜<b>${db.rps.win}</b></span><span>负<b>${db.rps.lose}</b></span><span>平<b>${db.rps.draw}</b></span></div></div>`;
    return `<div class="page">
      <div class="sub-head"><button class="icon-btn" data-act="back"><svg viewBox="0 0 24 24"><path d="m14.5 5.5-6 6.5 6 6.5"/></svg></button><h1>猜拳</h1></div>
      <div class="page-scroll">
        ${resultBox}
        <div class="rps-choices">
          ${moves.map((m) => `<button class="rps-choice" data-act="rps-play" data-move="${m.id}"><b>${m.ch}</b><span>${m.name}</span></button>`).join("")}
        </div>
        <div class="empty-note">每一局的结果，TA 都会在聊天里回一句。</div>
      </div>
    </div>`;
  }

  function playRps(move) {
    const c = activeContact();
    if (!c) { toast("还没有联系人"); return; }
    const label = { rock: "石头", scissors: "剪刀", paper: "布" };
    const ta = pick(["rock", "scissors", "paper"]);
    let res = 0;
    if ((move === "rock" && ta === "scissors") || (move === "scissors" && ta === "paper") || (move === "paper" && ta === "rock")) res = 1;
    else if (move === ta) res = 0;
    else res = -1;
    if (res === 1) db.rps.win++;
    else if (res === -1) db.rps.lose++;
    else db.rps.draw++;
    const lines = res === 1
      ? ["你赢了，这次让你。", "好吧，是我输了，手气给你。", "你厉害，我认输。"]
      : res === -1
        ? ["这局我赢了，下局不许耍赖。", "承让了。", "看来今天我更走运。"]
        : ["平局，说明我们想的一样。", "又一样，真是的。", "不分胜负，再来一局？"];
    const line = pick(lines);
    ui.rpsLast = { me: label[move], ta: label[ta], line, label: res === 1 ? "你赢了" : res === -1 ? "TA 赢了" : "平局" };
    save();
    addMessage(c, "them", "text", { text: line });
    render();
  }

  /* ---------- 红包 ---------- */
  const HB_PRESETS = [5.2, 13.14, 52, 99.99, 131.4, 520];

  function hongbaoHTML() {
    const c = activeContact();
    return `<div class="page">
      <div class="sub-head"><button class="icon-btn" data-act="back"><svg viewBox="0 0 24 24"><path d="m14.5 5.5-6 6.5 6 6.5"/></svg></button><h1>心意账本</h1><button class="ghost-btn" data-act="wallet-edit">设置余额</button></div>
      <div class="page-scroll">
        <div class="wallet-pair">
          <div class="wallet-cell"><span>我的零钱</span><b>¥${db.wallet.me.toFixed(2)}</b></div>
          <div class="wallet-cell"><span>${c ? esc(c.name) : "TA"} 的零钱</span><b>¥${db.wallet.them.toFixed(2)}</b></div>
        </div>
        <div class="empty-note" style="text-align:left;padding:14px 0 0">红包在聊天页的 ＋ 面板里直接发，不经过这里。</div>
        <div class="list-head"><h2>账本</h2><span>${db.ledger.length} 笔</span></div>
        ${db.ledger.length
          ? db.ledger.slice().reverse().slice(0, 20).map((x) => `<div class="card-row"><div class="card-body"><div class="card-text" style="font-size:13px">${x.from === "me" ? "发出" : "收到"} · ${esc(x.note || "红包")}</div><div class="card-meta"><span class="tag">${relTime(x.ts)}</span></div></div><div style="font-family:var(--font-serif);font-size:15px">${x.from === "me" ? "-" : "+"}¥${Number(x.amount).toFixed(2)}</div></div>`).join("")
          : `<div class="empty-note">还没有红包记录。</div>`}
      </div>
    </div>`;
  }

  function openWalletSheet() {
    openSheet(`<div class="sheet-title"><span>设置心意币</span><button class="x" data-close-sheet>×</button></div>
      <p class="sheet-note">账本余额由你自己决定，红包、礼物都从这里扣。</p>
      <div class="field"><label>我的零钱</label><input type="number" id="wMe" step="0.01" min="0" value="${Number(db.wallet.me).toFixed(2)}"></div>
      <div class="field"><label>TA 的零钱</label><input type="number" id="wThem" step="0.01" min="0" value="${Number(db.wallet.them).toFixed(2)}"></div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="wSave">保存</button></div>`);
    $("#wSave").onclick = () => {
      const me = Number($("#wMe").value);
      const them = Number($("#wThem").value);
      if (!isFinite(me) || !isFinite(them) || me < 0 || them < 0) { toast("金额不能小于 0"); return; }
      db.wallet.me = Number(me.toFixed(2));
      db.wallet.them = Number(them.toFixed(2));
      save();
      closeSheet();
      render();
      toast("余额已保存");
    };
  }

  function sendHongbao(cid, amount, note) {
    const c = findContact(cid);
    if (!c) { toast("还没有联系人"); return; }
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) { toast("金额要大于 0"); return; }
    db.wallet.me -= amt;
    db.ledger.push({ id: uid(), from: "me", amount: amt, note, ts: Date.now() });
    save();
    const msg = addMessage(c, "me", "hongbao", { amount: amt, note, claimed: false });
    toast("红包已发出");
    if (route.name !== "chat") render();
    setTimeout(() => {
      if (!findContact(c.id)) return;
      if (Math.random() < 0.8) {
        msg.claimed = true;
        db.wallet.them += amt;
        save();
        const thanks = pick(["收到了，谢谢你。", "红包我收了，心意也收了。", "你怎么又发，我记着了。"]);
        addMessage(c, "them", "text", { text: thanks });
      }
    }, rnd(6, 12) * 1000);
  }

  function openHongbaoSheet(cid) {
    const c = findContact(cid) || activeContact();
    if (!c) { toast("还没有联系人"); return; }
    openSheet(`<div class="sheet-title"><span>发红包</span><button class="x" data-close-sheet>×</button></div>
      <p class="sheet-note">给 ${esc(c.name)} · 我的零钱 ¥${db.wallet.me.toFixed(2)}</p>
      <div class="hb-amount-field"><small>¥</small><input type="number" id="hbAmountInput" step="0.01" min="0.01" value="${ui.hbAmount}"></div>
      <div class="hb-presets">
        ${HB_PRESETS.map((a) => `<button class="hb-preset ${Math.abs(ui.hbAmount - a) < 0.001 ? "on" : ""}" data-act="hb-pick" data-amt="${a}">${a === 520 ? "520" : a.toFixed(2)}</button>`).join("")}
      </div>
      <div class="field"><label>留言</label><input type="text" id="hbNote" placeholder="恭喜发财，大吉大利" maxlength="40"></div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="hbSendBtn">塞进红包</button></div>`);
    $("#hbAmountInput").addEventListener("input", (e) => {
      const v = Number(e.target.value);
      $$(".hb-preset").forEach((b) => b.classList.toggle("on", Math.abs(Number(b.dataset.amt) - v) < 0.001));
    });
    $("#hbSendBtn").onclick = () => {
      const amount = Number($("#hbAmountInput").value);
      const note = ($("#hbNote").value.trim()) || "恭喜发财，大吉大利";
      ui.hbAmount = amount;
      closeSheet();
      sendHongbao(c.id, amount, note);
    };
  }

  /* ---------- 礼物 ---------- */
  function marketHTML() {
    const c = activeContact();
    return `<div class="page">
      <div class="sub-head"><button class="icon-btn" data-act="back"><svg viewBox="0 0 24 24"><path d="m14.5 5.5-6 6.5 6 6.5"/></svg></button><h1>礼物市集</h1></div>
      <div class="page-scroll">
        <div class="market-balance"><span>我的零钱 · 心意币</span><b>¥${db.wallet.me.toFixed(2)}</b></div>
        <div class="market-grid">
          ${SEED.market.map((g) => `<button class="goods" data-act="gift-pick" data-name="${esc(g.name)}">
            <span class="g-icon">${g.icon}</span>
            <div class="g-name"><span>${esc(g.name)}</span><em>¥${g.price}</em></div>
            <div class="g-desc">${esc(g.desc)}</div>
          </button>`).join("")}
        </div>
      </div>
    </div>`;
  }

  function pickGift(name) {
    const c = activeContact();
    if (!c) { toast("还没有联系人"); return; }
    const g = SEED.market.find((x) => x.name === name);
    if (!g) return;
    openSheet(`<div class="sheet-title"><span>送出礼物</span><button class="x" data-close-sheet>×</button></div>
      <div style="display:flex;gap:12px;align-items:center;padding:6px 0 4px"><span class="gift-icon">${g.icon}</span><div><div class="gift-name">${esc(g.name)}</div><div class="gift-sub">¥${g.price} · 送给 ${esc(c.name)}</div></div></div>
      <div class="field"><label>心意留言</label><input type="text" id="giftNote" placeholder="写一句，不用太长" maxlength="60"></div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>再想想</button><button class="solid-btn" id="giftSend">送出</button></div>`);
    $("#giftSend").onclick = () => {
      const note = $("#giftNote").value.trim();
      db.wallet.me -= g.price;
      save();
      addMessage(c, "me", "gift", { name: g.name, icon: g.icon, price: g.price, note });
      db.gifts.sent.push({ id: uid(), name: g.name, icon: g.icon, price: g.price, note, cid: c.id, ts: Date.now() });
      save();
      closeSheet();
      toast("礼物已送出");
      render();
      setTimeout(() => {
        if (!findContact(c.id)) return;
        addMessage(c, "them", "text", { text: pick(["收到了，我收好了。", "谢谢你，我会好好放着。", "这个我喜欢，真的。"]) });
        if (Math.random() < 0.28) {
          const back = pick(SEED.market);
          db.gifts.received.push({ id: uid(), name: back.name, icon: back.icon, price: back.price, note: "回礼，收着。", cid: c.id, ts: Date.now() });
          save();
          addMessage(c, "them", "gift", { name: back.name, icon: back.icon, price: back.price, note: "回礼，收着。" });
        }
      }, rnd(3, 7) * 1000);
    };
  }

  function giftboxHTML() {
    const tab = ui.giftTab;
    const list = tab === "received" ? db.gifts.received : db.gifts.sent;
    return `<div class="page">
      <div class="sub-head"><button class="icon-btn" data-act="back"><svg viewBox="0 0 24 24"><path d="m14.5 5.5-6 6.5 6 6.5"/></svg></button><h1>心意柜</h1></div>
      <div class="page-scroll">
        <div class="seg"><button class="${tab === "received" ? "on" : ""}" data-act="gift-tab" data-val="received">收到 ${db.gifts.received.length}</button><button class="${tab === "sent" ? "on" : ""}" data-act="gift-tab" data-val="sent">送出 ${db.gifts.sent.length}</button></div>
        ${list.length
          ? list.slice().reverse().map((g) => `<div class="contact-row"><span class="gift-icon">${esc(g.icon)}</span><div class="c-main"><div class="c-name">${esc(g.name)}<span class="tag">¥${g.price}</span></div><div class="c-prev">${esc(g.note || "没有留言")}</div></div><div class="c-side"><span class="c-time">${relTime(g.ts)}</span></div></div>`).join("")
          : `<div class="empty-note">这里还是空的。</div>`}
      </div>
    </div>`;
  }

  /* ---------- 我的 ---------- */
  function meHTML() {
    const cardCount = db.publicCards.length + db.contacts.reduce((a, c) => a + (c.cards || []).length, 0);
    const letters = db.letters.filter((l) => l.from === "them").length;
    return `<div class="page">
      <div class="topbar"><div><div class="tb-title">我的</div><div class="tb-sub">本地 · 无需联网</div></div></div>
      <div class="page-scroll">
        <div class="profile-card">
          ${avatarHTML(db.profile.avatar, "xl")}
          <div class="profile-main"><div class="profile-name">${esc(db.profile.name)}</div><div class="profile-sub">字间用户 · 数据存在这台设备</div></div>
          <button class="ghost-btn" data-act="profile-edit">编辑</button>
        </div>
        <div class="stats">
          <div class="stat"><b>${db.contacts.length}</b><span>联系人</span></div>
          <div class="stat"><b>${cardCount}</b><span>字卡</span></div>
          <div class="stat"><b>${letters}</b><span>来信</span></div>
        </div>

        <div class="sec-title">心意币</div>
        <div class="panel">
          <div class="panel-row" data-act="wallet-edit" style="cursor:pointer"><div class="pr-main">心意币余额<small>我的 ¥${db.wallet.me.toFixed(2)} · TA 的 ¥${db.wallet.them.toFixed(2)}</small></div><span class="chev">›</span></div>
        </div>

        <div class="sec-title">回复设置</div>
        <div class="panel">
          <div class="panel-row"><div class="pr-main">回复速度<small>从你发送到 TA 回复的间隔，可自己填秒数</small></div>
            <div class="sec-input"><input type="number" data-set="replySec" min="1" max="120" step="1" value="${Number(db.settings.replySec) || 3}"><span>秒</span></div>
          </div>
          <div class="panel-row"><div class="pr-main">多条回复<small>一次回复抽 1–3 张字卡</small></div>
            <select data-set="multi"><option value="off" ${db.settings.multi === "off" ? "selected" : ""}>偶尔</option><option value="low" ${db.settings.multi === "low" ? "selected" : ""}>少</option><option value="mid" ${db.settings.multi === "mid" ? "selected" : ""}>中</option><option value="high" ${db.settings.multi === "high" ? "selected" : ""}>多</option></select>
          </div>
          <div class="panel-row"><div class="pr-main">每封信抽取字卡<small>TA 写信时从字卡库抽几张</small></div>
            <select data-set="letterCount"><option value="1" ${db.settings.letterCount === 1 ? "selected" : ""}>1 张</option><option value="2" ${db.settings.letterCount === 2 ? "selected" : ""}>2 张</option><option value="3" ${db.settings.letterCount === 3 ? "selected" : ""}>3 张</option><option value="4" ${db.settings.letterCount === 4 ? "selected" : ""}>4 张</option><option value="5" ${db.settings.letterCount === 5 ? "selected" : ""}>5 张</option></select>
          </div>
          <div class="panel-row"><div class="pr-main">TA 会主动找你<small>隔一段时间没说话，TA 可能先开口</small></div><button class="switch ${db.settings.proactive ? "on" : ""}" data-act="toggle" data-key="proactive"></button></div>
          <div class="panel-row"><div class="pr-main">全局免打扰<small>所有未读只显示小圆点</small></div><button class="switch ${db.settings.muteAll ? "on" : ""}" data-act="toggle" data-key="muteAll"></button></div>
          <div class="panel-row"><div class="pr-main">手机消息通知<small>页面切到后台时，收到消息会弹系统通知</small></div><button class="switch ${db.settings.notify ? "on" : ""}" data-act="toggle" data-key="notify"></button></div>
        </div>

        <div class="sec-title">数据</div>
        <div class="panel">
          <div class="panel-row" data-act="export-backup" style="cursor:pointer"><div class="pr-main">导出备份<small>聊天、字卡、信件、礼物一份 JSON</small></div><span class="chev">›</span></div>
          <div class="panel-row" data-act="import-backup" style="cursor:pointer"><div class="pr-main">导入备份<small>用之前导出的文件恢复</small></div><span class="chev">›</span></div>
          <div class="panel-row" data-act="clear-all" style="cursor:pointer"><div class="pr-main" style="color:#9B3A2E">清空全部数据<small>联系人、字卡、聊天记录都会删除</small></div><span class="chev">›</span></div>
        </div>

        <div class="sec-title">关于</div>
        <div class="panel">
          <div class="panel-row" data-act="about" style="cursor:pointer"><div class="pr-main">关于字间<small>虚构娱乐 · 请勿替代真实关系</small></div><span class="chev">›</span></div>
          <div class="panel-row"><div class="pr-main">版本</div><span style="font-size:11px;color:var(--ink-3)">1.0 · 本地版</span></div>
        </div>
        <div class="empty-note" style="margin-top:28px">数据清除后无法找回。<br>请定期导出备份。</div>
      </div>
    </div>`;
  }

  /* ---------- 弹层 ---------- */
  const sheetsEl = $("#sheets");

  function openSheet(html) {
    sheetsEl.innerHTML = `<div class="sheet-backdrop" data-close-sheet></div><div class="sheet-wrap"><div class="sheet"><div class="sheet-grip"></div>${html}</div></div>`;
    sheetsEl.classList.add("on");
  }

  function closeSheet() {
    sheetsEl.classList.remove("on");
    setTimeout(() => {
      if (!sheetsEl.classList.contains("on")) sheetsEl.innerHTML = "";
    }, 300);
  }

  function askConfirm(title, desc, label, onYes) {
    openSheet(`<div class="sheet-title"><span>${esc(title)}</span><button class="x" data-close-sheet>×</button></div>
      <p class="sheet-note">${esc(desc)}</p>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="confirmYes">${esc(label)}</button></div>`);
    $("#confirmYes").onclick = () => {
      closeSheet();
      onYes();
    };
  }

  function openContactSheet(cid) {
    const c = findContact(cid);
    if (!c) return;
    openSheet(`<div class="sheet-title"><span>${esc(c.name)}</span><button class="x" data-close-sheet>×</button></div>
      <div style="display:flex;gap:14px;align-items:center;padding:4px 0 10px">${avatarHTML(c.avatar, "lg")}<div><div style="font-size:15px">${esc(c.name)}</div><div style="font-size:11px;color:var(--ink-3);margin-top:4px">${statusOf(c).label} · ${personaName(c.persona)} · ${(c.cards || []).length} 张专属字卡</div></div></div>
      <div class="panel">
        <div class="panel-row"><div class="pr-main">免打扰</div><button class="switch ${c.mute ? "on" : ""}" data-act="toggle-contact-mute" data-cid="${c.id}"></button></div>
        <div class="panel-row" data-act="call" data-cid="${c.id}" style="cursor:pointer"><div class="pr-main">语音通话</div><span class="chev">›</span></div>
        <div class="panel-row" data-act="edit-contact" data-cid="${c.id}" style="cursor:pointer"><div class="pr-main">编辑资料</div><span class="chev">›</span></div>
        <div class="panel-row" data-act="search-chat" data-cid="${c.id}" style="cursor:pointer"><div class="pr-main">查找聊天记录</div><span class="chev">›</span></div>
        <div class="panel-row" data-act="clear-chat" data-cid="${c.id}" style="cursor:pointer"><div class="pr-main">清空聊天记录</div><span class="chev">›</span></div>
        <div class="panel-row" data-act="delete-contact" data-cid="${c.id}" style="cursor:pointer"><div class="pr-main" style="color:#9B3A2E">删除联系人</div><span class="chev">›</span></div>
      </div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>关闭</button></div>`);
  }

  function openContactEditor(cid) {
    const c = findContact(cid);
    if (!c) return;
    ui.sheetAvatar = c.avatar;
    ui.sheetPersona = c.persona;
    ui.sheetStatus = c.status || "online";
    openSheet(`<div class="sheet-title"><span>编辑联系人</span><button class="x" data-close-sheet>×</button></div>
      <div class="field"><label>名字</label><input type="text" id="ecName" maxlength="12" value="${esc(c.name)}"></div>
      <div class="field"><label>头像</label><div class="avatar-picker">${avatarOptionsHTML(ui.sheetAvatar)}</div>${avatarUploadHTML("sheet")}</div>
      <div class="field"><label>状态</label><div class="status-picker">${statusOptionsHTML(ui.sheetStatus, "sheet-status")}</div></div>
      <div class="field"><label>性格</label><div class="persona-grid">${personaOptionsHTML(ui.sheetPersona)}</div></div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="ecSave">保存</button></div>`);
    $("#ecSave").onclick = () => {
      const name = $("#ecName").value.trim();
      if (!name) { toast("名字不能为空"); return; }
      c.name = name;
      c.avatar = ui.sheetAvatar || c.avatar;
      c.persona = ui.sheetPersona || c.persona;
      c.status = ui.sheetStatus || c.status || "online";
      save();
      closeSheet();
      toast("已保存");
      render();
    };
  }

  function avatarOptionsHTML(selected) {
    return SEED.avatarChars.map((ch) => `<button class="avatar-opt ${selected === ch ? "on" : ""}" data-act="sheet-avatar" data-val="${ch}">${ch}</button>`).join("");
  }
  function avatarUploadHTML(target) {
    const val = target === "ob" ? ui.ob.avatar : ui.sheetAvatar;
    return `<div class="avatar-upload-row"><span id="avatarPreview" class="avatar lg">${avatarInner(val)}</span><button class="ghost-btn" data-act="avatar-upload" data-target="${target}">上传图片</button></div>`;
  }
  function statusOptionsHTML(selected, act) {
    return STATUSES.map((s) => `<button class="status-opt ${selected === s.id ? "on" : ""}" data-act="${act}" data-val="${s.id}"><i style="background:${s.color}"></i>${s.label}</button>`).join("");
  }
  function refreshAvatarPreview(target) {
    const pv = $("#avatarPreview");
    if (pv) pv.innerHTML = avatarInner(target === "ob" ? ui.ob.avatar : ui.sheetAvatar);
    $$(".avatar-opt").forEach((b) => b.classList.remove("on"));
  }
  function personaOptionsHTML(selected) {
    return SEED.personas.map((p) => `<button class="persona ${selected === p.id ? "on" : ""}" data-act="sheet-persona" data-val="${p.id}"><b>${p.name}</b><span>${p.desc}</span></button>`).join("");
  }

  function openNewContactSheet() {
    ui.sheetAvatar = "昼";
    ui.sheetPersona = "zhikui";
    ui.sheetStatus = "online";
    openSheet(`<div class="sheet-title"><span>新建联系人</span><button class="x" data-close-sheet>×</button></div>
      <div class="field"><label>名字</label><input type="text" id="ncName" maxlength="12" placeholder="比如：阿昼"></div>
      <div class="field"><label>头像</label><div class="avatar-picker">${avatarOptionsHTML(ui.sheetAvatar)}</div>${avatarUploadHTML("sheet")}</div>
      <div class="field"><label>初始状态</label><div class="status-picker">${statusOptionsHTML(ui.sheetStatus, "sheet-status")}</div></div>
      <div class="field"><label>性格</label><div class="persona-grid">${personaOptionsHTML(ui.sheetPersona)}</div></div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="ncSave">创建</button></div>`);
    $("#ncSave").onclick = () => {
      const name = $("#ncName").value.trim();
      if (!name) { toast("先给 TA 一个名字"); return; }
      const c = {
        id: uid(), name, avatar: ui.sheetAvatar, persona: ui.sheetPersona,
        status: ui.sheetStatus,
        cards: [], messages: [], unread: 0, mute: false, pinned: false,
        draft: "", lastAt: Date.now(), createdAt: Date.now()
      };
      const greeting = {
        zhikui: `我是${name}。我不绕弯子，以后就直接跟你说话了。`,
        nianren: `我是${name}。你要常来找我，不然我会一直等。`,
        badao: `我是${name}。以后有事直接说，别自己扛。`,
        huanshi: `我是${name}。你会一直在这里吗？`,
        mingan: `我是${name}。如果我哪里说得不对，你要告诉我。`,
        furuan: `我是${name}。我嘴笨，说错了你多担待。`
      }[ui.sheetPersona] || `你好，我是${name}。`;
      c.messages.push({ id: uid(), from: "them", kind: "text", text: greeting, ts: Date.now() });
      db.contacts.push(c);
      db.currentCid = c.id;
      save();
      closeSheet();
      toast("已创建");
      render();
    };
  }

  function openCardSheet() {
    if (ui.cardsScope === "private" && !activeContact()) {
      toast("专属字卡需要先选联系人");
      return;
    }
    ui.sheetPersonas = [];
    openSheet(`<div class="sheet-title"><span>添加字卡</span><button class="x" data-close-sheet>×</button></div>
      <div class="field"><label>字卡内容</label><textarea id="acText" maxlength="120" placeholder="一句会被抽中的话…"></textarea></div>
      <div class="field"><label>分类</label><select id="acCat">${SEED.categories.map((c) => `<option ${c === ui.cardCat ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="field"><label>限定性格（不选就是通用）</label><div class="persona-grid">${SEED.personas.map((p) => `<button class="persona" data-act="sheet-card-persona" data-val="${p.id}"><b>${p.name}</b><span>${p.desc}</span></button>`).join("")}</div></div>
      <div class="field"><label>保存到</label><select id="acScope"><option value="public" ${ui.cardsScope === "public" ? "selected" : ""}>公用字卡</option><option value="private" ${ui.cardsScope === "private" ? "selected" : ""}>专属字卡</option></select></div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="acSave">保存</button></div>`);
    $("#acSave").onclick = () => {
      const text = $("#acText").value.trim();
      if (!text) { toast("字卡不能为空"); return; }
      const scope = $("#acScope").value;
      const added = addCards([{ text, cat: $("#acCat").value, personas: ui.sheetPersonas }], scope);
      if (!added) { toast("这张字卡已经有了"); return; }
      closeSheet();
      toast("已添加");
      render();
    };
  }

  function openChatSearch(cid) {
    const c = findContact(cid);
    if (!c) return;
    openSheet(`<div class="sheet-title"><span>查找聊天记录</span><button class="x" data-close-sheet>×</button></div>
      <div class="search-box" style="margin-top:0"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><input id="chatSearch" placeholder="输入关键词"></div>
      <div id="searchResults" style="max-height:44vh;overflow-y:auto"></div>`);
    const input = $("#chatSearch");
    const run = () => {
      const q = input.value.trim();
      const box = $("#searchResults");
      if (!q) { box.innerHTML = `<div class="empty-note">输入关键词，找到那句话。</div>`; return; }
      const hits = c.messages.filter((m) => m.kind !== "sys" && String(m.text || m.note || m.name || "").includes(q));
      box.innerHTML = hits.length
        ? hits.map((m) => `<div class="card-row" data-act="jump" data-mid="${m.id}"><div class="card-body"><div class="card-text" style="font-size:13.5px">${esc(m.text || m.note || m.name)}</div><div class="card-meta"><span class="tag">${m.from === "me" ? "我" : c.name} · ${dayLabel(m.ts)} ${fmtClock(m.ts)}</span></div></div></div>`).join("")
        : `<div class="empty-note">没有找到。</div>`;
    };
    input.addEventListener("input", run);
    run();
    setTimeout(() => input.focus(), 100);
  }

  function openProfileEditor() {
    ui.sheetAvatar = db.profile.avatar;
    openSheet(`<div class="sheet-title"><span>编辑我的资料</span><button class="x" data-close-sheet>×</button></div>
      <div class="field"><label>名字</label><input type="text" id="pfName" maxlength="12" value="${esc(db.profile.name)}"></div>
      <div class="field"><label>头像</label><div class="avatar-picker">${avatarOptionsHTML(ui.sheetAvatar)}</div>${avatarUploadHTML("sheet")}</div>
      <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="pfSave">保存</button></div>`);
    $("#pfSave").onclick = () => {
      const name = $("#pfName").value.trim();
      if (!name) { toast("名字不能为空"); return; }
      db.profile.name = name;
      db.profile.avatar = ui.sheetAvatar || db.profile.avatar;
      save();
      closeSheet();
      render();
    };
  }

  function openPlusPanel(cid) {
    const items = [
      { act: "pat", icon: "拍", label: "拍一拍" },
      { act: "hb", icon: "红", label: "红包" },
      { act: "gift", icon: "礼", label: "礼物" },
      { act: "rps", icon: "拳", label: "猜拳" },
      { act: "letter", icon: "信", label: "写信" },
      { act: "search-chat", icon: "搜", label: "查找记录" }
    ];
    openSheet(`<div class="sheet-title"><span>更多</span><button class="x" data-close-sheet>×</button></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:4px 0 8px">
        ${items.map((it) => `<button class="goods" data-act="panel-${it.act}" data-cid="${cid}" style="text-align:center;padding:16px 6px"><span class="g-icon" style="margin:0 auto">${it.icon}</span><div style="font-size:12px;margin-top:9px">${it.label}</div></button>`).join("")}
      </div>`);
  }

  /* ---------- 备份 ---------- */
  function exportBackup() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    a.href = url;
    a.download = `字间备份-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("备份已导出");
  }

  function triggerImport(kind) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); } catch (e) { toast("文件不是有效的 JSON"); return; }
        if (kind === "backup") {
          if (!data || typeof data !== "object" || !Array.isArray(data.contacts)) { toast("不是字间的备份文件"); return; }
          const base2 = defaultDB();
          db = Object.assign(base2, data);
          db.settings = Object.assign({}, base2.settings, data.settings || {});
          db.wallet = Object.assign({}, base2.wallet, data.wallet || {});
          db.daily = Object.assign({}, base2.daily, data.daily || {});
          db.meta = Object.assign({}, base2.meta, data.meta || {});
          db.gifts = Object.assign({}, base2.gifts, data.gifts || {});
          if (!Array.isArray(db.moments)) db.moments = [];
          db.contacts.forEach((c) => {
            if (!STATUSES.some((s) => s.id === c.status)) c.status = "online";
          });
          db.onboarded = true;
          save();
          route = { name: "home" };
          render();
          toast("备份已恢复");
        } else {
          const arr = Array.isArray(data) ? data : Array.isArray(data.cards) ? data.cards : [];
          if (!arr.length) { toast("没找到可导入的字卡"); return; }
          const added = addCards(arr, ui.cardsScope);
          render();
          toast(added ? `已导入 ${added} 张` : "内容都已存在");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function exportCards() {
    const cards = cardsForScope();
    const blob = new Blob([JSON.stringify(cards.map((c) => ({ text: c.text, cat: c.cat, personas: c.personas })), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `字间字卡-${ui.cardsScope === "private" ? (activeContact() ? activeContact().name : "专属") : "公用"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("字卡已导出");
  }

  function clearAll() {
    askConfirm("清空全部数据", "联系人、字卡、聊天记录、信件、礼物与零钱都会删除，且无法恢复。建议先导出备份。", "确认清空", () => {
      localStorage.removeItem(KEY);
      db = defaultDB();
      route = { name: "home" };
      ui.ob = { name: "", myName: "我", avatar: "昼", persona: "zhikui" };
      render();
      toast("已清空");
    });
  }

  /* ---------- 事件 ---------- */
  document.addEventListener("click", (e) => {
    const closeEl = e.target.closest("[data-close-sheet]");
    if (closeEl) {
      e.stopPropagation();
      closeSheet();
      return;
    }
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act;
    const cid = t.dataset.cid;

    switch (act) {
      case "tab": {
        const tab = t.dataset.tab;
        route = { name: tab };
        ui.cardQ = "";
        render();
        break;
      }
      case "back": {
        if (route.name === "chat") route = { name: "home" };
        else if (["moments", "letters", "bottle", "rps", "hongbao", "market", "giftbox"].includes(route.name)) route = { name: "discover" };
        else route = { name: "home" };
        closeSheet();
        render();
        break;
      }
      case "ob-avatar": {
        ui.ob.avatar = t.dataset.val;
        $$(".avatar-opt").forEach((b) => b.classList.toggle("on", b === t));
        break;
      }
      case "ob-status": {
        ui.ob.status = t.dataset.val;
        $$(".status-opt").forEach((b) => b.classList.toggle("on", b === t));
        break;
      }
      case "avatar-upload": {
        const target = t.dataset.target || "sheet";
        pickImageFile((url) => {
          if (target === "ob") ui.ob.avatar = url;
          else ui.sheetAvatar = url;
          refreshAvatarPreview(target);
          toast("头像已选好");
        }, 256);
        break;
      }
      case "sheet-status": {
        ui.sheetStatus = t.dataset.val;
        $$(".status-opt").forEach((b) => b.classList.toggle("on", b.dataset.val === ui.sheetStatus));
        break;
      }
      case "ob-persona": {
        ui.ob.persona = t.dataset.val;
        $$("#app .persona").forEach((b) => b.classList.toggle("on", b === t));
        break;
      }
      case "ob-start": startApp(); break;

      case "mood": {
        db.daily.mood = t.dataset.val;
        save();
        $$(".mood-chip").forEach((b) => b.classList.toggle("on", b === t));
        toast("记下了");
        break;
      }
      case "chat": {
        const c = findContact(t.dataset.cid);
        if (!c) break;
        db.currentCid = c.id;
        c.unread = 0;
        c.messages.forEach((m) => { if (m.from === "them") m.read = true; });
        save();
        route = { name: "chat", cid: c.id };
        render();
        break;
      }
      case "send": {
        const input = $("#chatInput");
        sendUserText(input ? input.value : "");
        break;
      }
      case "plus": openPlusPanel(cid); break;
      case "panel-pat": {
        const c = findContact(cid);
        if (!c) break;
        closeSheet();
        addMessage(c, "sys", "sys", { text: `${db.profile.name} 拍了拍 ${c.name}` });
        setTimeout(() => {
          if (!findContact(c.id)) return;
          addMessage(c, "them", "text", { text: pick(["你拍我干嘛。", "在呢。", "轻点拍。", "被你拍到了。"]) });
        }, rnd(2, 5) * 1000);
        render();
        break;
      }
      case "panel-hb": closeSheet(); openHongbaoSheet(cid); break;
      case "panel-gift": closeSheet(); route = { name: "market" }; render(); break;
      case "panel-rps": closeSheet(); route = { name: "rps" }; render(); break;
      case "panel-letter": closeSheet(); openLetterWrite(cid); break;
      case "panel-search-chat": closeSheet(); openChatSearch(cid); break;

      case "contact-info": openContactSheet(cid); break;
      case "call": closeSheet(); startCall(t.dataset.cid || cid || route.cid || db.currentCid); break;
      case "call-hangup": endCall(); break;
      case "add-contact": openNewContactSheet(); break;
      case "edit-contact": openContactEditor(cid); break;
      case "toggle-contact-mute": {
        const c = findContact(cid);
        if (!c) break;
        c.mute = !c.mute;
        save();
        t.classList.toggle("on", c.mute);
        render();
        break;
      }
      case "clear-chat": {
        const c = findContact(cid);
        if (!c) break;
        askConfirm("清空聊天记录", `与 ${c.name} 的聊天记录会全部删除，无法恢复。`, "清空", () => {
          c.messages = [];
          c.unread = 0;
          c.lastAt = Date.now();
          save();
          closeSheet();
          if (route.name === "chat") route = { name: "home" };
          render();
          toast("已清空");
        });
        break;
      }
      case "delete-contact": {
        const c = findContact(cid);
        if (!c) break;
        askConfirm("删除联系人", `删除 ${c.name} 后，这位的联系人资料、专属字卡与聊天记录都会消失。`, "删除", () => {
          db.contacts = db.contacts.filter((x) => x.id !== cid);
          db.letters = db.letters.filter((l) => l.cid !== cid);
          if (db.currentCid === cid) db.currentCid = db.contacts[0] ? db.contacts[0].id : null;
          save();
          closeSheet();
          route = { name: "home" };
          render();
          toast("已删除");
        });
        break;
      }
      case "search-chat": openChatSearch(cid); break;
      case "jump": {
        const mid = t.dataset.mid;
        closeSheet();
        setTimeout(() => {
          const row = $("#msg-" + mid);
          if (row) {
            row.scrollIntoView({ block: "center", behavior: "smooth" });
            row.classList.add("flash");
            setTimeout(() => row.classList.remove("flash"), 1200);
          }
        }, 320);
        break;
      }

      case "cards-scope": ui.cardsScope = t.dataset.val; ui.cardQ = ""; render(); break;
      case "cards-cat": ui.cardCat = t.dataset.val; render(); break;
      case "cards-add": openCardSheet(); break;
      case "card-del": {
        const id = t.dataset.id;
        askConfirm("删除字卡", "这张字卡会被永久删除。", "删除", () => {
          if (ui.cardsScope === "private" && activeContact()) {
            activeContact().cards = activeContact().cards.filter((c) => c.id !== id);
          } else {
            db.publicCards = db.publicCards.filter((c) => c.id !== id);
          }
          save();
          render();
          toast("已删除");
        });
        break;
      }
      case "cards-import": triggerImport("cards"); break;
      case "cards-export": exportCards(); break;
      case "cards-dedupe": {
        const n = dedupeCards();
        render();
        toast(n ? `已去掉 ${n} 张重复字卡` : "没有重复的字卡");
        break;
      }
      case "sheet-avatar": {
        ui.sheetAvatar = t.dataset.val;
        $$(".avatar-opt").forEach((b) => b.classList.toggle("on", b.dataset.val === ui.sheetAvatar));
        break;
      }
      case "sheet-persona": {
        ui.sheetPersona = t.dataset.val;
        $$(".persona").forEach((b) => b.classList.toggle("on", b.dataset.val === ui.sheetPersona));
        break;
      }
      case "sheet-card-persona": {
        const v = t.dataset.val;
        const idx = ui.sheetPersonas.indexOf(v);
        if (idx >= 0) ui.sheetPersonas.splice(idx, 1);
        else ui.sheetPersonas.push(v);
        t.classList.toggle("on", ui.sheetPersonas.includes(v));
        break;
      }

      case "open-moments": route = { name: "moments" }; render(); break;
      case "open-letters": route = { name: "letters" }; render(); break;
      case "open-bottle": route = { name: "bottle" }; render(); break;
      case "open-rps": route = { name: "rps" }; render(); break;
      case "open-hongbao": route = { name: "hongbao" }; render(); break;
      case "open-market": route = { name: "market" }; render(); break;
      case "open-giftbox": route = { name: "giftbox" }; render(); break;
      case "letter-open": openLetter(t.dataset.id); break;
      case "letter-write": openLetterWrite(); break;
      case "letter-reply": closeSheet(); openLetterWrite(cid); break;

      case "bottle-pick": pickBottle(); break;
      case "bottle-write": {
        openSheet(`<div class="sheet-title"><span>写一个瓶子</span><button class="x" data-close-sheet>×</button></div>
          <div class="field"><label>瓶中信</label><textarea id="bottleText" maxlength="160" placeholder="写给捡到它的人…"></textarea></div>
          <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>取消</button><button class="solid-btn" id="bottleSend">扔进海里</button></div>`);
        $("#bottleSend").onclick = () => {
          const text = $("#bottleText").value.trim();
          if (!text) { toast("瓶子不能是空的"); return; }
          db.bottles.push({ id: uid(), text, ts: Date.now() });
          save();
          closeSheet();
          render();
          toast("瓶子已扔出");
        };
        break;
      }

      case "rps-play": playRps(t.dataset.move); break;

      case "wallet-edit": openWalletSheet(); break;
      case "hb-pick": {
        const amt = Number(t.dataset.amt);
        const input = $("#hbAmountInput");
        if (input) input.value = amt;
        $$(".hb-preset").forEach((b) => b.classList.toggle("on", b === t));
        break;
      }
      case "moment-publish": openMomentPublish(); break;
      case "moment-like": {
        const m = findMoment(t.dataset.mid);
        if (!m) break;
        const i = m.likes.indexOf("me");
        if (i >= 0) m.likes.splice(i, 1);
        else m.likes.push("me");
        save();
        render();
        break;
      }
      case "moment-comment": openMomentComment(t.dataset.mid); break;
      case "moment-del": {
        const m = findMoment(t.dataset.mid);
        if (!m) break;
        askConfirm("删除动态", "这条动态和下面的评论都会删除。", "删除", () => {
          db.moments = db.moments.filter((x) => x.id !== m.id);
          save();
          closeSheet();
          render();
          toast("已删除");
        });
        break;
      }
      case "mm-image": {
        pickImageFile((url) => {
          ui.mmImage = url;
          const pv = $("#mmPreview");
          if (pv) pv.innerHTML = `<img src="${esc(url)}" alt="">`;
          const clr = $("#mmClear");
          if (clr) clr.hidden = false;
        }, 900);
        break;
      }
      case "mm-image-clear": {
        ui.mmImage = null;
        const pv = $("#mmPreview");
        if (pv) pv.innerHTML = "";
        const clr = $("#mmClear");
        if (clr) clr.hidden = true;
        break;
      }
      case "hb-open": {
        const mid = t.dataset.mid;
        const c = findContact(route.cid) || activeContact();
        if (!c) break;
        const m = c.messages.find((x) => x.id === mid);
        if (!m) break;
        openSheet(`<div class="sheet-title"><span>红包</span><button class="x" data-close-sheet>×</button></div>
          <div class="hb-body" style="text-align:center;padding:26px 0 18px"><div class="hb-coin" style="margin:0 auto 14px">¥</div><div class="hb-amt" style="font-size:34px"><small>¥</small>${Number(m.amount).toFixed(2)}</div><div class="hb-note" style="font-size:12px;color:var(--ink-3);margin-top:10px">${esc(m.note || "")}</div></div>
          <p class="sheet-note" style="text-align:center">${m.claimed ? "这个红包已经领取了。" : "红包还在等 TA 领取。"}</p>
          <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>收起</button></div>`);
        break;
      }

      case "gift-pick": pickGift(t.dataset.name); break;
      case "gift-tab": ui.giftTab = t.dataset.val; render(); break;

      case "toggle": {
        const key = t.dataset.key;
        if (key === "notify") {
          enableNotifications();
          break;
        }
        if (key === "proactive" || key === "muteAll") {
          db.settings[key] = !db.settings[key];
          save();
          t.classList.toggle("on", db.settings[key]);
        }
        break;
      }
      case "profile-edit": openProfileEditor(); break;
      case "export-backup": exportBackup(); break;
      case "import-backup": {
        askConfirm("导入备份", "导入会覆盖当前所有数据。建议先把现有数据导出一份。", "继续导入", () => triggerImport("backup"));
        break;
      }
      case "clear-all": clearAll(); break;
      case "about": {
        openSheet(`<div class="sheet-title"><span>关于字间</span><button class="x" data-close-sheet>×</button></div>
          <p class="sheet-note" style="font-size:12px;line-height:2;color:var(--ink-2)">
          字间是一个纯本地的字卡传讯站。TA 不会思考，所有回复都是你自己写的字卡，被随机抽出来的一刻。<br><br>
          数据只保存在当前浏览器的 localStorage 里，不上传任何服务器。清除浏览器数据、换设备都会导致内容消失，请定期到「我的 - 导出备份」保存 JSON。<br><br>
          站内一切对话都属虚构娱乐，不能替代真实的人际交往与情感支持。若你正处在情绪困境中，请优先联系身边的人或专业帮助。<br><br>
          「字卡传讯」的玩法灵感来自小红书上关于字卡传讯的公开笔记与讨论（Mochi 字卡、milk 字卡等），本站代码从零编写，纯本地、免费，仅供私人使用。
          </p>
          <div class="sheet-actions"><button class="ghost-btn" data-close-sheet>知道了</button></div>`);
        break;
      }
      default: break;
    }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "memoInput") {
      db.daily.memo = t.value;
      save();
    } else if (t.id === "chatInput") {
      const c = findContact(route.cid || db.currentCid);
      if (c) {
        c.draft = t.value;
        if (c.draft) save();
      }
    } else if (t.id === "cardSearch") {
      ui.cardQ = t.value;
      refreshCardList();
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.set) {
      const key = t.dataset.set;
      if (key === "letterCount") db.settings.letterCount = Number(t.value);
      else if (key === "replySec") {
        db.settings.replySec = Math.min(120, Math.max(1, Math.round(Number(t.value) || 3)));
        t.value = db.settings.replySec;
      }
      else if (key === "delay" || key === "multi") db.settings[key] = t.value;
      save();
      toast("设置已保存");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.id === "chatInput" && e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      sendUserText(e.target.value);
    }
  });

  /* ---------- 主动消息 ---------- */
  let proactiveDone = false;
  function maybeProactive() {
    if (proactiveDone) return;
    proactiveDone = true;
    if (!db.settings.proactive) return;
    for (const c of db.contacts) {
      const last = c.messages[c.messages.length - 1];
      const base = last ? last.ts : c.createdAt || 0;
      if (Date.now() - base > 2.5 * 3600 * 1000 && Math.random() < 0.4) {
        const card = drawCards(c, 1)[0];
        if (!card) continue;
        addMessage(c, "them", "text", { text: card.text });
      }
    }
  }

  /* ---------- 启动 ---------- */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (e) => {
      const d = e.data || {};
      if (d.type === "open-chat") openChatById(d.cid);
    });
  }
  ensureDaily();
  if (db.onboarded) maybeDailyLetters();
  render();
  setTimeout(maybeProactive, 2600);
  setInterval(() => {
    const el = $(".home-time");
    if (el && route.name === "home") el.textContent = fmtClock(Date.now()) + " · 本地时间";
  }, 30000);

  window._zijian = { db, render, save };
})();
