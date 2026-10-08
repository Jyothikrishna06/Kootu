/* ============ KOOTTU - CAMPUS MENTORSHIP APP ============ */

/* ============ CLOUD DATABASE CONFIG ============ */
/* To connect your free Supabase database:
   1. Create a project at https://supabase.com
   2. Settings -> API -> copy Project URL and anon public key
   3. Paste them below
   4. Run the SQL script from KOOTU-setup-guide.md in Supabase SQL Editor */
const SUPABASE_URL = "https://stjfhjtsdauuzwdthtjl.supabase.co"; // Your Supabase Project URL
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0amZoanRzZGF1dXp3ZHRodGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NDAyNDgsImV4cCI6MjEwNzAxNjI0OH0.G30NRypays3ayHMOABuuesyrqu06-016yV5Tlv2pCOM";

let DB = null;
let realtimeChannel = null;

try {
  if (SUPABASE_URL && SUPABASE_KEY && window.supabase && !SUPABASE_URL.includes("your-project")) {
    const cleanUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
    DB = window.supabase.createClient(cleanUrl, SUPABASE_KEY);
  }
} catch (e) {
  console.warn("Supabase initialization skipped/failed:", e);
}

/* ============ SECURITY & SANITIZATION HELPERS ============ */
/* Prevents Cross-Site Scripting (XSS) in all interpolated text */
function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(u) {
  if (!u) return "";
  const trimmed = String(u).trim();
  if (/^https?:\/\//i.test(trimmed)) return esc(trimmed);
  return "https://" + esc(trimmed);
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ============ DATABASE / STORAGE FUNCTIONS ============ */
async function dbLoadColleges() {
  if (!DB) return;
  try {
    const { data, error } = await DB.from("colleges").select("name").order("name");
    if (error) { console.warn("Load colleges:", error.message); return; }
    (data || []).forEach(r => {
      if (r.name && !COLLEGES.some(c => c.toLowerCase() === r.name.toLowerCase())) {
        COLLEGES.push(r.name);
      }
    });
  } catch (e) { console.warn("dbLoadColleges exception:", e); }
}

async function dbAddCollege(name) {
  if (!DB) return;
  try {
    const { error } = await DB.from("colleges").insert({ name });
    if (error && error.code !== "23505") console.warn("Add college:", error.message);
  } catch (e) { console.warn("dbAddCollege exception:", e); }
}

async function dbLoadMentors(college) {
  if (!DB) return null;
  try {
    const { data, error } = await DB.from("mentors").select("*").eq("college", college);
    if (error) { console.warn("Load mentors:", error.message); return null; }
    return data || [];
  } catch (e) { return null; }
}

async function dbAddMentor(m) {
  if (!DB) return { ok: false, reason: "offline" };
  try {
    let existing = null;
    try { existing = await dbGetMentorByEmail(m.email); } catch (e) {}

    const writeRow = row => existing
      ? DB.from("mentors").update(row).eq("email", m.email)
      : DB.from("mentors").insert(row);

    let row = { ...m }, error, tries = 0;
    do {
      ({ error } = await writeRow(row));
      if (!error) return { ok: true };
      const col = (error.message || "").match(/'([a-z_]+)' column/i);
      if (col && Object.prototype.hasOwnProperty.call(row, col[1])) {
        delete row[col[1]];
        tries++;
      } else break;
    } while (tries < 8);

    console.warn("Save mentor error:", error && error.message);
    return { ok: false, reason: error && error.message };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function dbUpdateMentorPhoto(email, photo) {
  if (!DB || !email) return;
  try {
    const { error } = await DB.from("mentors").update({ photo }).eq("email", email);
    if (error) console.warn("Update photo:", error.message);
  } catch (e) {}
}

async function dbGetMentorByEmail(email) {
  if (!DB || !email) return null;
  try {
    const { data, error } = await DB.from("mentors").select("*").eq("email", email).limit(1);
    if (error) { console.warn("Get mentor by email:", error.message); return null; }
    return (data && data[0]) || null;
  } catch (e) { return null; }
}

async function dbGetMentorById(id) {
  if (!DB || !id) return null;
  try {
    const { data, error } = await DB.from("mentors").select("*").eq("id", id).limit(1);
    if (error) return null;
    return (data && data[0]) || null;
  } catch (e) { return null; }
}

async function uploadPhotoIfPossible(dataUrl, userEmail) {
  if (!DB || !DB.storage || !dataUrl.startsWith("data:image/")) return dataUrl;
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const cleanEmail = (userEmail || "user").replace(/[^a-zA-Z0-9]/g, "_");
    const path = `avatar_${cleanEmail}_${Date.now()}.jpg`;
    const { data, error } = await DB.storage.from("avatars").upload(path, blob, {
      contentType: "image/jpeg",
      upsert: true
    });
    if (!error && data) {
      const { data: pubData } = DB.storage.from("avatars").getPublicUrl(path);
      if (pubData && pubData.publicUrl) return pubData.publicUrl;
    }
  } catch (e) {
    console.warn("Storage upload fallback to compressed data URL:", e);
  }
  return dataUrl;
}

/* ---- Juniors ---- */
async function dbAddJunior(j) {
  if (!DB) return null;
  try {
    const { data, error } = await DB.from("juniors").upsert(j, { onConflict: "email" }).select().single();
    if (error && error.code !== "PGRST205") console.warn("Add junior:", error.message);
    return data;
  } catch (e) { return null; }
}

async function dbGetJuniorByEmail(email) {
  if (!DB || !email) return null;
  try {
    const { data, error } = await DB.from("juniors").select("*").eq("email", email).limit(1);
    if (error) return null;
    return (data && data[0]) || null;
  } catch (e) { return null; }
}

async function dbUpdateJuniorPassword(email, passHash) {
  if (!DB || !email) return false;
  try {
    const { error } = await DB.from("juniors").update({ pass_hash: passHash }).eq("email", email);
    return !error;
  } catch (e) { return false; }
}

/* ---- Matches ---- */
async function dbAddMatch(rec) {
  if (!DB) return null;
  try {
    const { data, error } = await DB.from("matches").insert(rec).select().single();
    if (error) { console.warn("Add match:", error.message); return null; }
    return data;
  } catch (e) { return null; }
}

async function dbGetJuniorMatch(email) {
  if (!DB || !email) return null;
  try {
    const { data, error } = await DB.from("matches").select("*").eq("junior_email", email).eq("status", "active").limit(1);
    if (error) { console.warn("Junior match:", error.message); return null; }
    return (data && data[0]) || null;
  } catch (e) { return null; }
}

async function dbGetMentorMatches(email, college) {
  if (!DB) return [];
  try {
    let q = DB.from("matches").select("*").eq("status", "active");
    if (email) q = q.eq("mentor_email", email);
    else if (college) q = q.eq("college", college);
    const { data, error } = await q;
    if (error) { console.warn("Mentor matches:", error.message); return []; }
    return data || [];
  } catch (e) { return []; }
}

async function dbEndMatch(id) {
  if (!DB || !id) return;
  try {
    const { error } = await DB.from("matches").update({ status: "ended" }).eq("id", id);
    if (error) console.warn("End match:", error.message);
  } catch (e) {}
}

/* ---- Real-time Messaging (Two-Way Chat) ---- */
async function dbLoadMessages(matchId) {
  if (!matchId) return [];
  if (!DB) {
    try {
      return JSON.parse(localStorage.getItem(`kootu_chat_${matchId}`) || "[]");
    } catch (e) { return []; }
  }
  try {
    const { data, error } = await DB.from("messages").select("*").eq("match_id", matchId).order("created_at", { ascending: true });
    if (error) {
      console.warn("Load messages:", error.message);
      return JSON.parse(localStorage.getItem(`kootu_chat_${matchId}`) || "[]");
    }
    return data || [];
  } catch (e) {
    return JSON.parse(localStorage.getItem(`kootu_chat_${matchId}`) || "[]");
  }
}

async function dbSendMessage(matchId, senderRole, senderEmail, senderName, content) {
  if (!matchId || !content) return null;
  const msgObj = {
    match_id: matchId,
    sender_role: senderRole,
    sender_email: senderEmail,
    sender_name: senderName,
    content: content,
    created_at: new Date().toISOString()
  };

  // Always keep a local copy
  try {
    const key = `kootu_chat_${matchId}`;
    const local = JSON.parse(localStorage.getItem(key) || "[]");
    local.push(msgObj);
    localStorage.setItem(key, JSON.stringify(local));
  } catch (e) {}

  if (!DB) return msgObj;

  try {
    const { data, error } = await DB.from("messages").insert({
      match_id: matchId,
      sender_role: senderRole,
      sender_email: senderEmail,
      sender_name: senderName,
      content: content
    }).select().single();
    if (error) { console.warn("Send message:", error.message); return msgObj; }
    return data || msgObj;
  } catch (e) {
    return msgObj;
  }
}

function subscribeRealtimeChat(matchId, onNewMsg) {
  if (!DB || !matchId) return;
  try {
    if (realtimeChannel) {
      DB.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    realtimeChannel = DB.channel(`chat_${matchId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `match_id=eq.${matchId}`
      }, payload => {
        if (payload && payload.new) {
          onNewMsg(payload.new);
        }
      })
      .subscribe();
  } catch (e) {
    console.warn("Realtime subscription skipped:", e);
  }
}

/* ============ DECOR HELPERS ============ */
function starSVG(pos, fill) {
  return `<svg class="doodle" style="${pos}" viewBox="0 0 24 24" fill="${fill}" stroke="#2b2b2b" stroke-width="1.5" stroke-linejoin="round">
    <path d="M12 2l2.2 6.3 6.6.2-5.2 4 1.9 6.3L12 15.6 6.5 18.8l1.9-6.3-5.2-4 6.6-.2z"/></svg>`;
}

function cloudSVG(pos) {
  return `<svg class="doodle float" style="${pos}" viewBox="0 0 64 40" fill="#fff8df" stroke="#2b2b2b" stroke-width="2">
    <path d="M16 32c-8 0-12-5-12-10s5-9 10-8c2-7 9-11 16-9 5 1 8 5 9 9 6-1 11 3 11 9s-5 10-12 10z"/></svg>`;
}

function logoHTML(size) {
  size = size || 150;
  return `<img class="logoImg float" style="width:${size}px;height:${size}px" src="logo.png"
    onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block'">
    <span class="namecard" style="display:none">KOOTTU</span>`;
}

/* ============ STARTER DATA ============ */
const DEFAULT_COLLEGES = [
  "Model Engineering College, Ernakulam",
  "Cochin University of Science and Technology (CUSAT), Kochi",
  "College of Engineering Trivandrum (CET), Thiruvananthapuram",
  "NIT Calicut, Kozhikode",
  "Government Engineering College, Thrissur"
];

const COLLEGES = [...DEFAULT_COLLEGES];
const BRANCHES = [
  "Computer Science",
  "Electronics & Comm.",
  "Mechanical",
  "Electrical & Electronics",
  "Civil",
  "Information Technology",
  "AI & Data Science",
  "Chemical"
];
const SKILL_BANK = [
  "DSA", "Web Dev", "Machine Learning", "App Development", "UI/UX",
  "Competitive Programming", "GATE Prep", "Placements", "Higher Studies / GRE",
  "Robotics", "Embedded Systems", "Cloud", "Cybersecurity", "Startups",
  "Research Papers", "Internships"
];

/* Sample mentors for offline demo */
const MENTORS = [
  {
    id: 101,
    name: "Arjun Ramesh",
    email: "arjun.sample@mec.ac.in",
    college: "Model Engineering College, Ernakulam",
    branch: "Computer Science",
    year: "Final Year",
    gender: "Male",
    capacity: 2,
    skills: ["DSA", "Web Dev", "Placements"],
    qual: "Incoming SDE @ Cisco",
    ach: ["LeetCode 1850+", "Smart India Hackathon Finalist"],
    linkedin: "https://linkedin.com",
    bio: "Passionate about full-stack web development and cracking product company interviews. Happy to guide juniors on resumes and coding rounds!",
    photo: ""
  },
  {
    id: 102,
    name: "Devika Nair",
    email: "devika.sample@mec.ac.in",
    college: "Model Engineering College, Ernakulam",
    branch: "Computer Science",
    year: "Final Year",
    gender: "Female",
    capacity: 2,
    skills: ["Machine Learning", "Research Papers", "Higher Studies / GRE"],
    qual: "Published IEEE author",
    ach: ["Best Paper Award IEEE 2025", "GRE 328/340"],
    linkedin: "https://linkedin.com",
    bio: "Focused on AI/ML research and graduate school prep. Let's work together on research methodology and SOP reviews.",
    photo: ""
  }
];

/* ============ APPLICATION STATE ============ */
let S = {
  role: null,
  authMode: "login", // 'login' | 'signup'
  college: null,
  name: "Guest",
  email: "",
  mentorProfile: {
    branch: "", year: "", gender: "", skills: [], qual: "", ach: [],
    linkedin: "", photo: "", bio: "", capacity: 2
  },
  juniorProfile: {
    branch: "Computer Science",
    year: "1st Year",
    skills: [],
    bio: "",
    photo: ""
  },
  deck: [],
  allDeck: [],
  idx: 0,
  matched: null,
  matchedAt: null,
  matchId: null,
  activeMentee: null, // For mentor chat
  chat: []
};

/* ===== Mentorship trial lock (1 week) ===== */
const TRIAL_DAYS = 7;
function trialDaysLeft() {
  if (!S.matchedAt) return 0;
  const elapsed = (Date.now() - S.matchedAt) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
}

function saveMatchLS() {
  try {
    localStorage.setItem("kootu_match", JSON.stringify({ m: S.matched, at: S.matchedAt, id: S.matchId }));
  } catch (e) {}
}

function loadMatchLS() {
  try {
    const s = JSON.parse(localStorage.getItem("kootu_match") || "null");
    if (s && s.m) {
      S.matched = s.m;
      S.matchedAt = s.at;
      S.matchId = s.id || null;
    }
  } catch (e) {}
}

function clearMatchLS() {
  try { localStorage.removeItem("kootu_match"); } catch (e) {}
}

function saveMeLS() {
  try {
    localStorage.setItem("kootu_me", JSON.stringify({
      email: S.email,
      name: S.name,
      college: S.college,
      role: S.role,
      profile: S.mentorProfile,
      juniorProfile: S.juniorProfile
    }));
  } catch (e) {}
}

function loadMeLS() {
  try { return JSON.parse(localStorage.getItem("kootu_me") || "null"); } catch (e) { return null; }
}

/* ============ ROUTING & NAVIGATION (HISTORY API) ============ */
const app = document.getElementById("app");
const screens = {};
const renderers = {};

function reg(id, html) {
  const d = document.createElement("div");
  d.className = "screen";
  d.id = id;
  d.innerHTML = html;
  app.appendChild(d);
  screens[id] = d;
}

function show(id, push = true) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  if (!screens[id]) return;
  screens[id].classList.add("active");
  screens[id].scrollTop = 0;
  if (push) {
    try { history.pushState({ screen: id }, "", "#" + id); } catch (e) {}
  }
  if (renderers[id]) renderers[id]();
}

window.addEventListener("popstate", (e) => {
  if (e.state && e.state.screen && screens[e.state.screen]) {
    show(e.state.screen, false);
  } else {
    show("welcome", false);
  }
});

function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    app.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ============ SCREENS DEFINITIONS ============ */

/* 1. Welcome */
reg("welcome", `
${cloudSVG("top:18px;left:-10px;width:90px")}
${cloudSVG("top:70px;right:-8px;width:66px;opacity:.85")}
${starSVG("top:140px;left:24px;width:34px", "var(--pink)")}
${starSVG("top:210px;right:26px;width:42px", "var(--primary)")}
${starSVG("bottom:150px;left:18px;width:26px", "var(--accent)")}
<div class="pad" style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center;position:relative;z-index:2">
  <div style="text-align:center">${logoHTML(160)}</div>
  <div style="margin:4px 0 18px"><span class="namecard pink" style="font-size:15px;letter-spacing:2px;padding:5px 16px">MENTOR · MATCH</span></div>
  <div class="bubble" style="text-align:left;margin:0 6px">
    <b style="color:var(--primary-dark)">Find your campus mentor.</b><br>
    <span class="muted" style="font-size:14px">A mentor from your own college, who's already walked your path. ✨</span>
  </div>
  <div style="margin-top:30px;display:flex;flex-direction:column;gap:13px">
    <button class="btn btn-primary" onclick="show('college')">Get started</button>
    <button class="btn btn-pink" onclick="goReturningLogin()">I already have an account</button>
  </div>
  <p class="muted" style="margin-top:24px;font-size:12px">Learn · Share · Grow together 🌸</p>
</div>`);

/* 2. Choose College */
reg("college", `
<div class="topbar"><span class="back" onclick="history.back()">←</span><span class="t">Choose your college</span><span style="width:40px"></span></div>
${starSVG("top:70px;right:20px;width:26px", "var(--pink)")}
<div class="pad" style="flex:1;position:relative;z-index:2">
  <p class="muted" style="margin-top:0">We match you only within your own campus — so guidance feels close and relatable.</p>
  <input id="collegeSearch" placeholder="🔍 Search your college..." oninput="filterColleges()" style="margin:8px 0 6px">
  <div style="height:14px"></div>
  <div id="collegeList"></div>
</div>`);
renderers["college"] = () => {
  document.getElementById("collegeSearch").value = "";
  filterColleges();
};

function selectCollege(c) {
  S.college = c;
  show("role");
}

function openAddForm(prefill) {
  const list = document.getElementById("collegeList");
  list.innerHTML = `
    <div class="profcard" style="padding:16px">
      <div style="font-weight:800;font-size:16px;margin-bottom:4px">Add your college</div>
      <div class="muted" style="font-size:12px;margin-bottom:12px">Type the full official name and district.</div>
      <label class="fld">College name</label>
      <input id="addName" placeholder="e.g. Model Engineering College">
      <label class="fld" style="margin-top:10px">District / Location</label>
      <input id="addDistrict" placeholder="e.g. Ernakulam">
      <button class="btn btn-primary" style="margin-top:16px" onclick="confirmAddCollege()">Add college</button>
      <button class="btn btn-ghost" style="margin-top:10px" onclick="filterColleges()">Cancel</button>
    </div>`;
  const ni = document.getElementById("addName");
  ni.value = prefill || "";
  ni.focus();
}

function confirmAddCollege() {
  const name = (document.getElementById("addName").value || "").trim();
  const district = (document.getElementById("addDistrict").value || "").trim();
  if (!name) { toast("Please enter the college name"); return; }
  if (!district) { toast("Please enter the district"); return; }
  const full = `${name}, ${district}`;
  const existing = COLLEGES.find(c => c.toLowerCase() === full.toLowerCase());
  if (existing) { selectCollege(existing); return; }
  COLLEGES.push(full);
  dbAddCollege(full);
  selectCollege(full);
}

function filterColleges() {
  const raw = (document.getElementById("collegeSearch").value || "").trim();
  const q = raw.toLowerCase();
  const list = document.getElementById("collegeList");
  list.innerHTML = "";
  COLLEGES.filter(c => c.toLowerCase().includes(q)).forEach(c => {
    const d = document.createElement("div");
    d.className = "role";
    d.style.padding = "16px";
    d.innerHTML = `<div class="ic" style="background:var(--lav-soft)">🏛️</div><div style="font-weight:700;font-size:15px">${esc(c)}</div>`;
    d.onclick = () => selectCollege(c);
    list.appendChild(d);
  });
  const exact = COLLEGES.some(c => c.toLowerCase() === q);
  if (raw && !exact) {
    const a = document.createElement("div");
    a.className = "role";
    a.style.padding = "16px";
    a.innerHTML = `<div class="ic" style="background:var(--pink-soft,#ffe0ef)">➕</div>
      <div>
        <div style="font-weight:700;font-size:15px">Add "${esc(raw)}"</div>
        <div class="muted" style="font-size:11.5px;margin-top:3px">Not in list? Add your college & district.</div>
      </div>`;
    a.onclick = () => openAddForm(raw);
    list.appendChild(a);
  }
  if (!list.children.length) list.innerHTML = '<p class="muted center">Start typing your college name to search or add it.</p>';
}

/* 3. Choose Role */
reg("role", `
<div class="topbar"><span class="back" onclick="history.back()">←</span><span class="t">Who are you?</span><span style="width:40px"></span></div>
${starSVG("top:64px;right:24px;width:30px", "var(--accent)")}
<div class="pad" style="position:relative;z-index:2">
  <div class="banner" id="roleCollege"></div>
  <div class="role" onclick="pickRole('mentor')">
    <div class="ic" style="background:#d9f2e8">🧑‍🏫</div>
    <div><div style="font-weight:800;font-size:17px">I'm a Mentor (Senior)</div><div class="muted" style="font-size:13px">Share your journey, list your qualifications, guide juniors.</div></div>
  </div>
  <div class="role" onclick="pickRole('junior')">
    <div class="ic" style="background:var(--pink-soft)">🎓</div>
    <div><div style="font-weight:800;font-size:17px">I'm a Junior</div><div class="muted" style="font-size:13px">Discover seniors, find your one mentor, get going.</div></div>
  </div>
</div>`);
renderers["role"] = () => {
  document.getElementById("roleCollege").innerHTML = `📍 ${esc(S.college)}`;
};

function pickRole(r) {
  S.role = r;
  S.authMode = "signup";
  show("login");
}

/* 4. Auth / Sign In / Sign Up */
reg("login", `
<div class="topbar"><span class="back" onclick="loginBack()">←</span><span class="t" id="loginT">Account</span><span style="width:40px"></span></div>
${cloudSVG("top:54px;right:-6px;width:60px;opacity:.85")}
${starSVG("top:120px;left:18px;width:28px", "var(--pink)")}
${starSVG("bottom:50px;right:20px;width:34px", "var(--accent)")}
<div class="pad" style="position:relative;z-index:2">
  <div style="text-align:center;margin:2px 0 10px">${logoHTML(90)}</div>
  <div class="auth-switch">
    <button id="btnAuthLogin" class="active" onclick="setAuthMode('login')">Sign In</button>
    <button id="btnAuthSignup" onclick="setAuthMode('signup')">Create Account</button>
  </div>
  <div class="banner" id="loginCtx"></div>
  <div id="nameRow">
    <label class="fld">Full name</label>
    <input id="inName" placeholder="Your full name">
  </div>
  <label class="fld">College Email</label>
  <input id="inEmail" type="email" placeholder="you@college.ac.in">
  <label class="fld">Password</label>
  <input id="inPass" type="password" placeholder="At least 6 characters">
  <button class="btn btn-primary" id="btnAuthSubmit" style="margin-top:20px" onclick="doAuth()">Continue</button>
  <p class="center" style="margin-top:14px" id="forgotPassLink"><a href="javascript:void(0)" onclick="show('resetPass')" style="color:var(--primary-dark);font-weight:700;font-size:13px;text-decoration:underline">Forgot password? Reset it here 🔑</a></p>
  <p class="center muted" style="margin-top:14px;font-size:13px">Campus-exclusive & safe. Respectful vibes only. 💜</p>
</div>`);

reg("resetPass", `
<div class="topbar"><span class="back" onclick="show('login')">←</span><span class="t">Reset Password</span><span style="width:40px"></span></div>
${cloudSVG("top:54px;right:-6px;width:60px;opacity:.85")}
<div class="pad" style="position:relative;z-index:2">
  <div style="text-align:center;margin:2px 0 10px">${logoHTML(90)}</div>
  <div class="banner">🔑 Enter your registered email and a new password</div>
  <label class="fld">College Email</label>
  <input id="resetEmail" type="email" placeholder="you@college.ac.in">
  <label class="fld">New Password</label>
  <input id="resetPass1" type="password" placeholder="At least 6 characters">
  <label class="fld">Confirm New Password</label>
  <input id="resetPass2" type="password" placeholder="Re-enter your new password">
  <button class="btn btn-primary" id="btnResetSubmit" style="margin-top:22px" onclick="doResetPassword()">Save &amp; Log In</button>
  <button class="btn btn-ghost" style="margin-top:10px" onclick="show('login')">Cancel</button>
</div>`);

function setAuthMode(mode) {
  S.authMode = mode;
  document.getElementById("btnAuthLogin").className = mode === "login" ? "active" : "";
  document.getElementById("btnAuthSignup").className = mode === "signup" ? "active" : "";
  document.getElementById("nameRow").style.display = mode === "signup" ? "block" : "none";
  document.getElementById("btnAuthSubmit").textContent = mode === "signup" ? "Create Account" : "Sign In";
  document.getElementById("loginT").textContent = mode === "signup" ? "Sign Up" : "Welcome Back";
  const forgotEl = document.getElementById("forgotPassLink");
  if (forgotEl) forgotEl.style.display = mode === "login" ? "block" : "none";
}

renderers["login"] = () => {
  setAuthMode(S.authMode || "login");
  const ctx = document.getElementById("loginCtx");
  if (S.role && S.college) {
    ctx.innerHTML = `${S.role === "mentor" ? "🧑‍🏫 Mentor" : "🎓 Junior"} · ${esc(S.college)}`;
    ctx.style.display = "block";
  } else {
    ctx.innerHTML = "👋 Sign in with your registered college email";
  }
};

function goReturningLogin() {
  S.role = null;
  S.college = null;
  S.authMode = "login";
  show("login");
}

function loginBack() {
  if (S.role) show("role");
  else show("welcome");
}

async function doResetPassword() {
  const email = (document.getElementById("resetEmail").value || "").trim().toLowerCase();
  const p1 = document.getElementById("resetPass1").value || "";
  const p2 = document.getElementById("resetPass2").value || "";

  if (!email || !validateEmail(email)) { toast("Please enter a valid email address"); return; }
  if (!p1 || p1.length < 6) { toast("Password must be at least 6 characters"); return; }
  if (p1 !== p2) { toast("Passwords do not match"); return; }

  const btn = document.getElementById("btnResetSubmit");
  btn.disabled = true;
  btn.textContent = "Updating...";

  try {
    const encoded = btoa(p1);
    // 1. Update in local storage
    const users = JSON.parse(localStorage.getItem("kootu_users") || "{}");
    if (!users[email]) {
      users[email] = { email, pass: encoded };
    } else {
      users[email].pass = encoded;
    }
    localStorage.setItem("kootu_users", JSON.stringify(users));

    // 2. Update cloud juniors table
    await dbUpdateJuniorPassword(email, encoded);

    // 3. Update Supabase Auth if applicable
    if (DB && DB.auth) {
      try {
        await DB.auth.updateUser({ password: p1 });
      } catch (e) {}
    }

    toast("✅ Password reset! Logging you in...");
    S.email = email;
    await loadReturningProfile(email);
  } catch (e) {
    toast("Error: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save & Log In";
  }
}

async function doAuth() {
  const email = (document.getElementById("inEmail").value || "").trim().toLowerCase();
  const pass = (document.getElementById("inPass").value || "");
  const name = (document.getElementById("inName").value || "").trim();

  if (!email || !validateEmail(email)) {
    toast("Please enter a valid email address");
    return;
  }
  if (!pass || pass.length < 6) {
    toast("Password must be at least 6 characters");
    return;
  }
  if (S.authMode === "signup" && !name) {
    toast("Please enter your full name");
    return;
  }

  S.email = email;
  if (name) S.name = name;

  const submitBtn = document.getElementById("btnAuthSubmit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Verifying...";

  try {
    // 1. Try Supabase Auth if DB is alive
    if (DB && DB.auth) {
      if (S.authMode === "signup") {
        const { data: upData, error: upErr } = await DB.auth.signUp({
          email,
          password: pass,
          options: { data: { name: S.name, role: S.role, college: S.college } }
        });
        if (upErr && !upErr.message.includes("already registered")) {
          toast(upErr.message);
          submitBtn.disabled = false;
          submitBtn.textContent = "Create Account";
          return;
        }
      } else {
        const { data: inData, error: inErr } = await DB.auth.signInWithPassword({
          email,
          password: pass
        });
        if (inErr) {
          console.warn("Supabase auth warning:", inErr.message);
        }
      }
    }

    // Save offline user credentials & verify
    try {
      const users = JSON.parse(localStorage.getItem("kootu_users") || "{}");
      if (S.authMode === "signup") {
        users[email] = { name: S.name, role: S.role, college: S.college, pass: btoa(pass) };
        localStorage.setItem("kootu_users", JSON.stringify(users));
        if (S.role === "junior" && DB) {
          await dbAddJunior({
            name: S.name,
            email: S.email,
            college: S.college,
            pass_hash: btoa(pass)
          });
        }
      } else if (users[email] && users[email].pass && users[email].pass !== btoa(pass)) {
        let cloudPassMatch = false;
        const jrCloud = await dbGetJuniorByEmail(email);
        if (jrCloud && jrCloud.pass_hash === btoa(pass)) {
          cloudPassMatch = true;
          users[email].pass = btoa(pass);
          localStorage.setItem("kootu_users", JSON.stringify(users));
        }
        if (!cloudPassMatch) {
          toast("Incorrect password. Tap 'Forgot password?' below to reset it.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Sign In";
          return;
        }
      }
    } catch (e) {}

    // Check existing role & profile
    if (S.authMode === "login") {
      await loadReturningProfile(email);
    } else {
      saveMeLS();
      if (S.role === "mentor") show("mProfile");
      else {
        await buildDeck();
        await restoreJuniorMatch();
        show("jHome");
      }
    }
  } catch (err) {
    console.warn("Auth error:", err);
    toast("Login completed");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = S.authMode === "signup" ? "Create Account" : "Sign In";
  }
}

async function loadReturningProfile(email) {
  // 1. Check junior match first
  const matchRow = await dbGetJuniorMatch(email);
  if (matchRow) {
    S.role = "junior";
    S.college = matchRow.college;
    S.name = matchRow.junior_name || "Student";
    S.matchId = matchRow.id;
    S.matchedAt = new Date(matchRow.started_at).getTime();
    const fullMentor = await dbGetMentorByEmail(matchRow.mentor_email);
    S.matched = fullMentor || {
      name: matchRow.mentor_name,
      college: matchRow.college,
      branch: "", year: "", gender: "", skills: [], ach: [], bio: "", photo: "", linkedin: ""
    };
    saveMeLS();
    await buildDeck();
    show("jHome");
    return;
  }

  // 2. Check juniors cloud table
  const jrCloud = await dbGetJuniorByEmail(email);
  if (jrCloud) {
    S.role = "junior";
    S.college = jrCloud.college;
    S.name = jrCloud.name || "Student";
    saveMeLS();
    await buildDeck();
    show("jHome");
    return;
  }

  // 3. Check mentor profile
  const mentor = await dbGetMentorByEmail(email);
  if (mentor) {
    S.role = "mentor";
    S.college = mentor.college;
    S.name = mentor.name;
    S.mentorProfile = {
      branch: mentor.branch || "",
      year: mentor.year || "",
      gender: mentor.gender || "",
      skills: Array.isArray(mentor.skills) ? mentor.skills : [],
      qual: mentor.qual || "",
      ach: Array.isArray(mentor.ach) ? mentor.ach : [],
      linkedin: mentor.linkedin || "",
      photo: mentor.photo || "",
      bio: mentor.bio || "",
      capacity: mentor.capacity || 2
    };
    _photoData = mentor.photo || "";
    saveMeLS();
    show("mHome");
    return;
  }

  // 4. Fallback to local storage
  const localMe = loadMeLS();
  if (localMe && localMe.email === email) {
    S.role = localMe.role || "junior";
    S.college = localMe.college;
    S.name = localMe.name || "Student";
    if (localMe.profile) S.mentorProfile = localMe.profile;
    if (S.role === "mentor") show("mHome");
    else {
      await buildDeck();
      show("jHome");
    }
    return;
  }

  const users = JSON.parse(localStorage.getItem("kootu_users") || "{}");
  if (users[email]) {
    S.role = users[email].role || "junior";
    S.college = users[email].college;
    S.name = users[email].name || "Student";
    saveMeLS();
    if (S.role === "mentor") show("mHome");
    else {
      await buildDeck();
      show("jHome");
    }
    return;
  }

  toast("No account found for that email. Sign up to get started!");
  setAuthMode("signup");
}

async function restoreJuniorMatch() {
  S.matched = null;
  S.matchedAt = null;
  S.matchId = null;
  if (!DB) { loadMatchLS(); return; }
  try {
    const row = await dbGetJuniorMatch(S.email);
    if (row) {
      S.matchId = row.id;
      S.matchedAt = new Date(row.started_at).getTime();
      const full = await dbGetMentorByEmail(row.mentor_email);
      S.matched = full || {
        name: row.mentor_name, college: row.college, branch: "", year: "",
        gender: "", skills: [], ach: [], bio: "", photo: "", linkedin: ""
      };
      saveMatchLS();
    }
  } catch (e) {
    loadMatchLS();
  }
}

/* 5. Mentor Profile Setup */
reg("mProfile", `
<div class="topbar"><span class="back" onclick="history.back()">←</span><span class="t">Mentor profile</span><span style="width:40px"></span></div>
<div class="progress"><i style="width:100%"></i></div>
<div class="pad">
  <p class="muted" style="margin-top:6px">Juniors from ${esc(S.college || "your college")} will see this.</p>
  <label class="fld">Branch</label>
  <select id="mBranch"></select>
  <div class="grid2">
    <div><label class="fld">Year</label><select id="mYear"><option>3rd Year</option><option>Final Year</option><option>Alumni</option></select></div>
    <div><label class="fld">Gender</label><select id="mGender"><option>Male</option><option>Female</option><option>Prefer not to say</option></select></div>
  </div>
  <label class="fld">Max Mentees You Can Guide</label>
  <select id="mCapacity">
    <option value="1">1 Junior (Focused)</option>
    <option value="2" selected>2 Juniors (Standard)</option>
    <option value="3">3 Juniors (Active)</option>
  </select>
  <label class="fld">Profile photo <small class="hint">(shown after match)</small></label>
  <input id="mPhoto" type="file" accept="image/*" onchange="previewPhoto(event)">
  <div id="mPhotoPrev" style="display:none;margin-top:8px"><img id="mPhotoImg" alt="" style="width:64px;height:64px;border-radius:14px;object-fit:cover;border:2px solid #2b2b2b"></div>
  <label class="fld">What can you help with?</label>
  <div class="chips" id="mSkills"></div>
  <label class="fld">Key achievements <small class="hint">(one per line)</small></label>
  <textarea id="mAch" rows="3" placeholder="SDE Intern @ ...&#10;Hackathon winner&#10;Published paper"></textarea>
  <label class="fld">LinkedIn profile <small class="hint">(optional)</small></label>
  <input id="mLinkedin" type="url" placeholder="https://linkedin.com/in/yourname">
  <label class="fld">About you <small class="hint">(up to 200 words)</small></label>
  <textarea id="mBio" rows="6" placeholder="Tell juniors about your journey, interests, and how you will guide them..." oninput="countBioWords()"></textarea>
  <div id="bioCount" class="muted" style="font-size:11.5px;text-align:right;margin-top:2px">0 / 200 words</div>
  <button class="btn btn-primary" id="btnPublishMentor" style="margin:20px 0 30px" onclick="saveMentor()">Publish my profile</button>
</div>`);

renderers["mProfile"] = () => {
  const b = document.getElementById("mBranch");
  if (!b.children.length) BRANCHES.forEach(x => b.add(new Option(x, x)));
  const sk = document.getElementById("mSkills");
  if (!sk.children.length) {
    SKILL_BANK.forEach(s => {
      const c = document.createElement("span");
      c.className = "chip";
      c.textContent = s;
      c.onclick = () => c.classList.toggle("on");
      sk.appendChild(c);
    });
  }
};

function genderEmoji(g) {
  return g === "Male" ? "👨‍🎓" : g === "Female" ? "👩‍🎓" : "🎓";
}
function wordCount(t) {
  t = (t || "").trim();
  return t ? t.split(/\s+/).length : 0;
}
function countBioWords() {
  const n = wordCount(document.getElementById("mBio").value);
  const el = document.getElementById("bioCount");
  el.textContent = n + " / 200 words";
  el.style.color = n > 200 ? "var(--red)" : "var(--muted)";
}

let _photoData = "";
function readFileToCropper(file, onDone) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => openCropper(ev.target.result, onDone);
  reader.readAsDataURL(file);
}

function previewPhoto(e) {
  const file = e.target.files && e.target.files[0];
  readFileToCropper(file, data => {
    _photoData = data;
    document.getElementById("mPhotoPrev").style.display = "block";
    document.getElementById("mPhotoImg").src = data;
  });
  e.target.value = "";
}

function changeHomePhoto() {
  const inp = document.getElementById("homePhotoInput");
  inp.onchange = async e => {
    const file = e.target.files && e.target.files[0];
    readFileToCropper(file, async data => {
      const finalUrl = await uploadPhotoIfPossible(data, S.email);
      S.mentorProfile.photo = finalUrl;
      _photoData = finalUrl;
      saveMeLS();
      if (renderers["mHome"]) renderers["mHome"]();
      if (DB) await dbUpdateMentorPhoto(S.email, finalUrl);
      toast("📷 Photo updated");
    });
    e.target.value = "";
  };
  inp.click();
}

/* Square Cropper */
const Crop = { img: null, iw: 0, ih: 0, base: 1, zoom: 1, tx: 0, ty: 0, ST: 280, OUT: 320, done: null };
function openCropper(src, onDone) {
  Crop.done = onDone;
  Crop.img = new Image();
  Crop.img.onload = () => {
    Crop.iw = Crop.img.naturalWidth;
    Crop.ih = Crop.img.naturalHeight;
    Crop.base = Math.max(Crop.ST / Crop.iw, Crop.ST / Crop.ih);
    Crop.zoom = 1;
    document.getElementById("cropZoom").value = 1;
    document.getElementById("cropImg").src = Crop.img.src;
    cropCenter();
    cropApplyTransform();
    document.getElementById("cropModal").classList.add("show");
  };
  Crop.img.src = src;
}
function closeCropper() {
  document.getElementById("cropModal").classList.remove("show");
}
function cropCenter() {
  const s = Crop.base * Crop.zoom;
  Crop.tx = (Crop.ST - Crop.iw * s) / 2;
  Crop.ty = (Crop.ST - Crop.ih * s) / 2;
}
function cropClamp() {
  const s = Crop.base * Crop.zoom, dw = Crop.iw * s, dh = Crop.ih * s;
  Crop.tx = Math.min(0, Math.max(Crop.ST - dw, Crop.tx));
  Crop.ty = Math.min(0, Math.max(Crop.ST - dh, Crop.ty));
}
function cropApplyTransform() {
  const s = Crop.base * Crop.zoom, im = document.getElementById("cropImg");
  im.style.width = (Crop.iw * s) + "px";
  im.style.height = (Crop.ih * s) + "px";
  im.style.left = Crop.tx + "px";
  im.style.top = Crop.ty + "px";
}
function cropZoomChange(v) {
  const oldS = Crop.base * Crop.zoom;
  const cx = (Crop.ST / 2 - Crop.tx) / oldS, cy = (Crop.ST / 2 - Crop.ty) / oldS;
  Crop.zoom = parseFloat(v);
  const newS = Crop.base * Crop.zoom;
  Crop.tx = Crop.ST / 2 - cx * newS;
  Crop.ty = Crop.ST / 2 - cy * newS;
  cropClamp();
  cropApplyTransform();
}
function applyCrop() {
  const s = Crop.base * Crop.zoom;
  const sx = (-Crop.tx) / s, sy = (-Crop.ty) / s, sSize = Crop.ST / s;
  const c = document.createElement("canvas");
  c.width = Crop.OUT;
  c.height = Crop.OUT;
  c.getContext("2d").drawImage(Crop.img, sx, sy, sSize, sSize, 0, 0, Crop.OUT, Crop.OUT);
  const data = c.toDataURL("image/jpeg", 0.82);
  closeCropper();
  if (Crop.done) Crop.done(data);
}

function initCropper() {
  const stage = document.getElementById("cropStage");
  if (!stage) return;
  let active = false;
  const pt = e => { const t = e.touches ? e.touches[0] : e; return { x: t.clientX, y: t.clientY }; };
  const start = e => { active = true; stage.classList.add("drag"); const p = pt(e); Crop.lx = p.x; Crop.ly = p.y; };
  const move = e => {
    if (!active) return;
    const p = pt(e);
    Crop.tx += p.x - Crop.lx;
    Crop.ty += p.y - Crop.ly;
    Crop.lx = p.x;
    Crop.ly = p.y;
    cropClamp();
    cropApplyTransform();
    if (e.cancelable) e.preventDefault();
  };
  const end = () => { active = false; stage.classList.remove("drag"); };
  stage.addEventListener("mousedown", start);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  stage.addEventListener("touchstart", start, { passive: false });
  stage.addEventListener("touchmove", move, { passive: false });
  stage.addEventListener("touchend", end);
}

async function saveMentor() {
  const chosen = [...document.querySelectorAll("#mSkills .chip.on")].map(c => c.textContent);
  if (chosen.length === 0) { toast("Pick at least one topic you can help with"); return; }
  if (wordCount(document.getElementById("mBio").value) > 200) { toast('Please keep "About you" under 200 words'); return; }

  const pubBtn = document.getElementById("btnPublishMentor");
  pubBtn.disabled = true;
  pubBtn.textContent = "Publishing...";

  let finalPhoto = _photoData;
  if (_photoData && _photoData.startsWith("data:image/")) {
    finalPhoto = await uploadPhotoIfPossible(_photoData, S.email);
  }

  S.mentorProfile = {
    branch: document.getElementById("mBranch").value,
    year: document.getElementById("mYear").value,
    gender: document.getElementById("mGender").value,
    capacity: parseInt(document.getElementById("mCapacity").value, 10) || 2,
    qual: "",
    skills: chosen,
    ach: (document.getElementById("mAch").value || "").split("\n").map(s => s.trim()).filter(Boolean),
    linkedin: (document.getElementById("mLinkedin").value || "").trim(),
    photo: finalPhoto || "",
    bio: document.getElementById("mBio").value || "Here to help you navigate campus life and growth."
  };

  const record = {
    name: S.name,
    email: S.email,
    college: S.college,
    branch: S.mentorProfile.branch,
    year: S.mentorProfile.year,
    gender: S.mentorProfile.gender,
    capacity: S.mentorProfile.capacity,
    linkedin: S.mentorProfile.linkedin,
    photo: S.mentorProfile.photo,
    skills: S.mentorProfile.skills,
    qual: S.mentorProfile.qual,
    ach: S.mentorProfile.ach.length ? S.mentorProfile.ach : ["New mentor — ready to guide juniors"],
    bio: S.mentorProfile.bio,
    pct: 92
  };

  saveMeLS();

  if (DB) {
    const res = await dbAddMentor(record);
    if (res && res.ok) toast("✅ Profile published to your campus");
    else toast("⚠️ Saved locally (cloud sync retry scheduled)");
  } else {
    toast("Saved locally (offline mode)");
  }

  pubBtn.disabled = false;
  pubBtn.textContent = "Publish my profile";
  show("mHome");
}

/* 6. Mentor Home */
reg("mHome", `
<div class="topbar"><span class="t">Mentor Hub 👋</span><span class="iconbtn" title="Log out" onclick="logout()">⎋</span></div>
<div class="pad" id="mHomeBody"></div>
<div class="tabbar">
  <div class="tab on"><span class="i">🏠</span>Home</div>
  <div class="tab" onclick="show('mPreview')"><span class="i">👤</span>Preview Card</div>
</div>`);

renderers["mHome"] = () => {
  const p = S.mentorProfile;
  document.getElementById("mHomeBody").innerHTML = `
    <div class="banner">📍 ${esc(S.college)} · 🧑‍🏫 ${esc(p.branch)}, ${esc(p.year)}</div>
    <div class="profcard">
      <div class="row">
        <div class="avatar editable" onclick="changeHomePhoto()" style="${p.photo ? `background-image:url('${esc(p.photo)}')` : `background:linear-gradient(135deg,var(--primary),var(--pink));display:grid;place-items:center;color:#fff;font-size:24px`}">${p.photo ? "" : (esc(S.name[0]) || "M").toUpperCase()}<span class="cam-badge">📷</span></div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:17px">${esc(S.name)}</div>
          <div class="muted" style="font-size:13px">${esc(p.branch)} · ${esc(p.year)}</div>
          <div class="tag" style="display:inline-block;margin-top:4px">Capacity: max ${p.capacity || 2} juniors</div>
        </div>
      </div>
      <div class="pill-list">${(p.skills || []).map(s => `<span class="tag">${esc(s)}</span>`).join("")}</div>
    </div>
    <h3 style="margin:22px 0 6px">Your Active Mentees</h3>
    <p class="muted" style="margin:0 0 12px;font-size:13px">Juniors from ${esc(S.college)} you are currently guiding 🌱</p>
    <div id="menteeList"><p class="muted center">Loading mentees…</p></div>
    <button class="btn btn-ghost" style="margin:26px 0 30px" onclick="logout()">Log out</button>
  `;
  loadMentees();
};

async function loadMentees() {
  const el = document.getElementById("menteeList");
  if (!el) return;
  const rows = await dbGetMentorMatches(S.email, S.college);
  if (!rows.length) {
    el.innerHTML = emptyMenteeCard(`When juniors from ${esc(S.college || "your college")} connect with you, they will appear here.`);
    return;
  }

  const jrMap = {};
  if (DB) {
    try {
      const { data: jrRows } = await DB.from("juniors").select("email, photo, branch, year");
      (jrRows || []).forEach(j => { jrMap[j.email] = j; });
    } catch(e) {}
  }

  el.innerHTML = rows.map(r => {
    const jData = jrMap[r.junior_email] || {};
    const photo = jData.photo;
    const subText = (jData.branch && jData.year)
      ? `${esc(jData.branch)} · ${esc(jData.year)} · ${esc(r.junior_email || "")}`
      : esc(r.junior_email || "");
    const avatarHtml = photo
      ? `<div class="avatar" style="background-image:url('${esc(photo)}');border:2px solid #2b2b2b"></div>`
      : `<div class="avatar" style="background:var(--lav-soft);display:grid;place-items:center;font-size:22px">🎓</div>`;

    return `
    <div class="profcard" style="margin-top:10px">
      <div class="row">
        ${avatarHtml}
        <div style="flex:1">
          <div style="font-weight:800">${esc(r.junior_name || "Junior")}</div>
          <div class="muted" style="font-size:13px">${subText}</div>
        </div>
      </div>
      <div class="mentee-actions">
        <button class="btn btn-sm btn-sm-primary" onclick="openMentorChat(${r.id}, '${esc(r.junior_name)}', '${esc(r.junior_email)}')">💬 Chat</button>
        <button class="btn btn-sm btn-sm-ghost" onclick="confirmEndMentorship(${r.id})">End mentorship</button>
      </div>
    </div>`;
  }).join("");
}

function emptyMenteeCard(msg) {
  return `<div class="profcard" style="text-align:center;padding:24px"><div style="font-size:40px">📭</div><div style="font-weight:700;margin-top:6px">No mentees yet</div><div class="muted" style="font-size:13px;margin-top:4px">${esc(msg)}</div></div>`;
}

function confirmEndMentorship(id) {
  if (confirm("Are you sure you want to conclude this mentorship?")) {
    dbEndMatch(id).then(() => {
      toast("Mentorship concluded");
      loadMentees();
    });
  }
}

/* 7. Mentor Preview */
reg("mPreview", `
<div class="topbar"><span class="back" onclick="history.back()">←</span><span class="t">Card Preview</span><span style="width:40px"></span></div>
<div class="deck" style="margin-bottom:20px" id="mPreviewDeck"></div>`);

renderers["mPreview"] = () => {
  const p = S.mentorProfile;
  const m = {
    name: S.name,
    college: S.college,
    branch: p.branch,
    year: p.year,
    gender: p.gender,
    linkedin: p.linkedin,
    photo: p.photo || "",
    skills: p.skills,
    qual: p.qual,
    ach: p.ach.length ? p.ach : ["New mentor — ready to help"],
    bio: p.bio,
    pct: 92
  };
  document.getElementById("mPreviewDeck").innerHTML = cardHTML(m, false);
};

/* 8. Mentor Chat with Junior */
reg("mChat", `
<div class="chathead">
  <span class="back" onclick="history.back()">←</span>
  <div class="av" style="background:var(--lav-soft)">🎓</div>
  <div style="flex:1;min-width:0">
    <div class="nm" id="mChatTitle">Mentee</div>
    <div class="sub" id="mChatSub">Active Mentorship · Tap back to exit</div>
  </div>
</div>
<div class="chatwrap" id="mChatWrap"></div>
<div class="chatbar">
  <input id="mChatInput" placeholder="Send a message to your mentee..." onkeydown="if(event.key==='Enter')sendMentorChat()">
  <button class="btn btn-primary" onclick="sendMentorChat()">Send</button>
</div>`);

function openMentorChat(matchId, juniorName, juniorEmail) {
  S.activeMentee = { id: matchId, name: juniorName, email: juniorEmail };
  show("mChat");
}

renderers["mChat"] = async () => {
  if (!S.activeMentee) { history.back(); return; }
  document.getElementById("mChatTitle").textContent = S.activeMentee.name;
  document.getElementById("mChatSub").textContent = `${S.activeMentee.email} · Live Chat`;

  const wrap = document.getElementById("mChatWrap");
  wrap.innerHTML = '<p class="muted center">Loading conversation…</p>';

  const msgs = await dbLoadMessages(S.activeMentee.id);
  renderMentorChatThread(msgs);

  subscribeRealtimeChat(S.activeMentee.id, newMsg => {
    msgs.push(newMsg);
    renderMentorChatThread(msgs);
  });
};

function renderMentorChatThread(msgs) {
  const wrap = document.getElementById("mChatWrap");
  if (!msgs || !msgs.length) {
    wrap.innerHTML = `<div class="empty"><div><div style="font-size:36px">💬</div><h4>Start the conversation</h4><p>Say hello to your mentee and set up your first discussion!</p></div></div>`;
    return;
  }
  wrap.innerHTML = msgs.map(c => {
    const isMe = c.sender_role === "mentor" || c.sender_email === S.email;
    const timeStr = c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    return `<div class="msg ${isMe ? "me" : "them"}">
      ${esc(c.content)}
      ${timeStr ? `<div class="time">${esc(timeStr)}</div>` : ""}
    </div>`;
  }).join("");
  wrap.scrollTop = wrap.scrollHeight;
}

async function sendMentorChat() {
  const inp = document.getElementById("mChatInput");
  const text = (inp.value || "").trim();
  if (!text || !S.activeMentee) return;
  inp.value = "";
  const sent = await dbSendMessage(S.activeMentee.id, "mentor", S.email, S.name, text);
  const msgs = await dbLoadMessages(S.activeMentee.id);
  renderMentorChatThread(msgs);
}

/* 9. Junior Discover Deck */
async function buildDeck() {
  const live = await dbLoadMentors(S.college);
  const local = MENTORS.filter(m => m.college === S.college);
  const seen = new Set();
  S.allDeck = (live || []).concat(local).filter(m => {
    if (m.college !== S.college) return false;
    const k = (m.email || m.name || "").toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  S.deck = [...S.allDeck];
  S.idx = 0;
}

function applyDeckFilters() {
  const b = document.getElementById("filterBranch") ? document.getElementById("filterBranch").value : "";
  const s = document.getElementById("filterSkill") ? document.getElementById("filterSkill").value : "";
  S.deck = S.allDeck.filter(m => {
    if (b && m.branch !== b) return false;
    if (s && (!m.skills || !m.skills.includes(s))) return false;
    return true;
  });
  S.idx = 0;
  renderDeck();
}

reg("jHome", `
<div class="topbar"><span class="t">Find your mentor</span><span class="iconbtn" title="Log out" onclick="logout()">⎋</span></div>
<div id="jBanner" class="pad" style="padding:10px 16px 0"></div>
<div class="deck-filters">
  <select class="filter-select" id="filterBranch" onchange="applyDeckFilters()">
    <option value="">All Branches</option>
  </select>
  <select class="filter-select" id="filterSkill" onchange="applyDeckFilters()">
    <option value="">All Skills</option>
  </select>
</div>
<div class="deck" id="jDeck"></div>
<div class="actions" id="jActions">
  <button class="fab no" onclick="swipe(false)">✕</button>
  <button class="fab yes" onclick="swipe(true)">♥</button>
</div>
<div class="tabbar">
  <div class="tab on" onclick="show('jHome')"><span class="i">🔥</span>Discover</div>
  <div class="tab" onclick="show('jMatch')"><span class="i">💬</span>My mentor</div>
  <div class="tab" onclick="show('jProfile')"><span class="i">👤</span>My Profile</div>
</div>`);

renderers["jHome"] = () => {
  document.getElementById("jBanner").innerHTML = `<div class="banner">📍 Seniors from ${esc(S.college)}</div>`;

  const fb = document.getElementById("filterBranch");
  if (fb && fb.options.length <= 1) {
    BRANCHES.forEach(b => fb.add(new Option(b, b)));
  }
  const fs = document.getElementById("filterSkill");
  if (fs && fs.options.length <= 1) {
    SKILL_BANK.forEach(s => fs.add(new Option(s, s)));
  }

  renderDeck();
};

function cardHTML(m, withStamps = true) {
  return `<div class="swipecard" id="topcard">
    ${withStamps ? '<div class="stamp like" id="stampLike">LIKE</div><div class="stamp nope" id="stampNope">PASS</div>' : ""}
    <div class="photo" style="${m.photo ? `background-image:url('${esc(m.photo)}')` : "background:linear-gradient(160deg,var(--primary),var(--pink))"};position:relative">
      ${m.photo ? "" : `<div style="position:absolute;inset:0;display:grid;place-items:center;font-size:96px">${genderEmoji(m.gender)}</div>`}
      <div class="who">
        <div style="font-size:22px;font-weight:800">${esc(m.name)}</div>
        <div style="font-size:14px;opacity:.95">${esc(m.branch)} · ${esc(m.year)}</div>
      </div>
    </div>
    <div class="body">
      <div class="pill-list">${(m.skills || []).map(s => `<span class="tag">${esc(s)}</span>`).join("")}</div>
      ${m.qual ? `<div class="section-t">Qualifications</div><div style="font-weight:700">${esc(m.qual)}</div>` : ""}
      <div class="section-t">Achievements</div>
      ${(m.ach || []).map(a => `<div style="font-size:14px;margin:3px 0">✦ ${esc(a)}</div>`).join("")}
      <div class="section-t">About</div><div style="font-size:14px;line-height:1.5">${esc(m.bio)}</div>
      <div class="hr"></div>
      <div class="kv"><span class="muted">College</span><b style="text-align:right;max-width:60%">${esc(m.college)}</b></div>
    </div>
  </div>`;
}

function renderDeck() {
  const d = document.getElementById("jDeck");
  if (!S.deck || S.deck.length === 0) {
    d.innerHTML = `<div class="empty"><div><div style="font-size:48px">🏫</div><h3>No mentors matching filters</h3><p>Try resetting filters or invite a senior from <b>${esc(S.college)}</b> to join Koottu!</p></div></div>`;
    document.getElementById("jActions").style.visibility = "hidden";
    return;
  }
  if (S.idx >= S.deck.length) {
    d.innerHTML = `<div class="empty"><div><div style="font-size:48px">🌟</div><h3>That's everyone for now</h3><p>New seniors join every week. You can review profiles again whenever you like!</p><button class="btn btn-soft" style="width:auto;padding:10px 18px" onclick="S.idx=0;renderDeck()">Review again</button></div></div>`;
    document.getElementById("jActions").style.visibility = "hidden";
    return;
  }
  document.getElementById("jActions").style.visibility = "visible";
  d.innerHTML = cardHTML(S.deck[S.idx]);
  enableDrag(document.getElementById("topcard"));
}

/* Leak-free card drag */
function enableDrag(card) {
  if (!card) return;
  let sx = 0, sy = 0, dx = 0, dy = 0, drag = false;
  const like = card.querySelector("#stampLike"), nope = card.querySelector("#stampNope");

  const move = e => {
    if (!drag) return;
    const p = e.touches ? e.touches[0] : e;
    dx = p.clientX - sx;
    dy = p.clientY - sy;
    card.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
    if (like) like.style.opacity = Math.max(0, Math.min(1, dx / 90));
    if (nope) nope.style.opacity = Math.max(0, Math.min(1, -dx / 90));
  };

  const up = () => {
    if (!drag) return;
    drag = false;
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("touchend", up);
    card.style.transition = "transform .3s ease";
    if (dx > 110) {
      card.style.transform = `translate(500px,${dy}px) rotate(30deg)`;
      setTimeout(() => swipe(true), 200);
    } else if (dx < -110) {
      card.style.transform = `translate(-500px,${dy}px) rotate(-30deg)`;
      setTimeout(() => swipe(false), 200);
    } else {
      card.style.transform = "";
      if (like) like.style.opacity = 0;
      if (nope) nope.style.opacity = 0;
    }
    dx = 0; dy = 0;
  };

  const down = e => {
    drag = true;
    const p = e.touches ? e.touches[0] : e;
    sx = p.clientX;
    sy = p.clientY;
    card.style.transition = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
  };

  card.addEventListener("mousedown", down);
  card.addEventListener("touchstart", down, { passive: true });
}

async function swipe(like) {
  const m = S.deck[S.idx];
  if (!m) return;

  if (like) {
    if (S.matched) {
      toast("You already have an active mentor — complete your trial first");
      return;
    }

    // Capacity verification
    const activeMenteeRows = await dbGetMentorMatches(m.email, m.college);
    const capacityLimit = m.capacity || 2;
    if (activeMenteeRows.length >= capacityLimit) {
      toast(`${esc(m.name)} is at full capacity (${capacityLimit} mentees). Please explore other seniors!`);
      S.idx++;
      renderDeck();
      return;
    }

    S.matched = m;
    S.matchedAt = Date.now();
    saveMatchLS();

    const createdMatch = await dbAddMatch({
      junior_name: S.name,
      junior_email: S.email,
      college: S.college,
      mentor_name: m.name,
      mentor_email: m.email,
      mentor_id: m.id || null,
      started_at: new Date(S.matchedAt).toISOString(),
      status: "active"
    });

    if (createdMatch) {
      S.matchId = createdMatch.id;
      saveMatchLS();
    } else {
      S.matchId = Date.now();
    }

    // Initialize welcome message
    await dbSendMessage(
      S.matchId,
      "mentor",
      m.email,
      m.name,
      `Hey ${esc(S.name)}! I'm ${esc(m.name.split(" ")[0])}. Happy to connect on Koottu 🎉 What would you like guidance on first?`
    );

    const av = document.getElementById("matchAv");
    if (m.photo) {
      av.textContent = "";
      av.style.backgroundImage = `url('${esc(m.photo)}')`;
      av.style.backgroundSize = "cover";
      av.style.backgroundPosition = "center";
    } else {
      av.style.backgroundImage = "none";
      av.style.background = "rgba(255,255,255,.25)";
      av.style.display = "grid";
      av.style.placeItems = "center";
      av.style.fontSize = "52px";
      av.textContent = genderEmoji(m.gender);
    }
    document.getElementById("matchSub").textContent = `You and ${esc(m.name)} are now connected as mentor & junior.`;
    S.idx++;
    show("jMatched");
    return;
  }

  S.idx++;
  renderDeck();
}

/* 10. Match Celebration */
reg("jMatched", `
<div class="pad center" style="flex:1;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(160deg,#b79ae6,#a78bdb);color:#fff">
  <div style="font-size:64px">💫</div>
  <h1 style="font-size:30px;margin-top:8px">It's a match!</h1>
  <p id="matchSub" style="opacity:.95;font-size:16px"></p>
  <div id="matchAv" class="avatar" style="width:110px;height:110px;border-radius:50%;margin:18px auto;border:4px solid #fff"></div>
  <div style="display:flex;flex-direction:column;gap:12px;margin-top:10px">
    <button class="btn" style="background:#fff;color:var(--primary-dark);border:2px solid #2b2b2b;box-shadow:3px 4px 0 #2b2b2b" onclick="show('jMatch')">Say hi 👋</button>
    <button class="btn" style="background:rgba(255,255,255,.2);color:#fff;border:2px solid #fff" onclick="show('jHome')">Keep exploring</button>
  </div>
</div>`);

/* 11. Junior Chat with Mentor */
reg("jMatch", `
<div class="chathead">
  <span class="back" onclick="show('jHome')">←</span>
  <div class="av" id="jChatAv" onclick="show('jMentorProfile')"></div>
  <div style="flex:1;min-width:0" onclick="show('jMentorProfile')">
    <div class="nm" id="jChatName"></div>
    <div class="sub" id="jChatSub"></div>
  </div>
  <span class="iconbtn" title="Log out" onclick="logout()">⎋</span>
</div>
<div class="chatwrap" id="jChatWrap"></div>
<div id="jChatBar"></div>
<div class="tabbar">
  <div class="tab" onclick="show('jHome')"><span class="i">🔥</span>Discover</div>
  <div class="tab on" onclick="show('jMatch')"><span class="i">💬</span>My mentor</div>
  <div class="tab" onclick="show('jProfile')"><span class="i">👤</span>My Profile</div>
</div>`);

renderers["jMatch"] = async () => {
  const head = document.querySelector("#jMatch .chathead");
  const wrap = document.getElementById("jChatWrap");
  const bar = document.getElementById("jChatBar");

  if (!S.matched) {
    head.style.display = "none";
    bar.innerHTML = "";
    wrap.innerHTML = `<div class="empty"><div><div style="font-size:48px">🫶</div><h3>No mentor selected yet</h3><p>Like a senior you vibe with — your match locks in your personalized mentor.</p><button class="btn btn-primary" style="width:auto;padding:11px 20px" onclick="show('jHome')">Start choosing</button></div></div>`;
    return;
  }

  const m = S.matched;
  head.style.display = "flex";
  const av = document.getElementById("jChatAv");
  if (m.photo) {
    av.textContent = "";
    av.style.backgroundImage = `url('${esc(m.photo)}')`;
  } else {
    av.style.backgroundImage = "none";
    av.style.background = "linear-gradient(135deg,var(--primary),var(--pink))";
    av.textContent = genderEmoji(m.gender);
  }
  document.getElementById("jChatName").textContent = m.name;
  document.getElementById("jChatSub").textContent = `${m.branch} · ${m.year} · Tap for profile`;

  bar.innerHTML = `<div class="chatbar">
    <input id="chatInput" placeholder="Message ${esc(m.name.split(" ")[0])}..." onkeydown="if(event.key==='Enter')sendChat()">
    <button class="btn btn-primary" onclick="sendChat()">Send</button>
  </div>`;

  wrap.innerHTML = '<p class="muted center">Loading conversation…</p>';
  const msgs = await dbLoadMessages(S.matchId);
  renderJuniorChatThread(msgs);

  subscribeRealtimeChat(S.matchId, newMsg => {
    msgs.push(newMsg);
    renderJuniorChatThread(msgs);
  });
};

function renderJuniorChatThread(msgs) {
  const wrap = document.getElementById("jChatWrap");
  if (!msgs || !msgs.length) {
    wrap.innerHTML = `<div class="empty"><div><div style="font-size:36px">💬</div><h4>Send the first message</h4><p>Ask about subjects, internships, or campus tips!</p></div></div>`;
    return;
  }
  wrap.innerHTML = msgs.map(c => {
    const isMe = c.sender_role === "junior" || c.sender_email === S.email;
    const timeStr = c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    return `<div class="msg ${isMe ? "me" : "them"}">
      ${esc(c.content)}
      ${timeStr ? `<div class="time">${esc(timeStr)}</div>` : ""}
    </div>`;
  }).join("");
  wrap.scrollTop = wrap.scrollHeight;
}

async function sendChat() {
  const i = document.getElementById("chatInput");
  const t = (i.value || "").trim();
  if (!t || !S.matchId) return;
  i.value = "";
  await dbSendMessage(S.matchId, "junior", S.email, S.name, t);
  const msgs = await dbLoadMessages(S.matchId);
  renderJuniorChatThread(msgs);
}

/* 12. Junior Views Mentor Profile */
reg("jMentorProfile", `
<div class="topbar"><span class="back" onclick="history.back()">←</span><span class="t">Mentor Profile</span><span style="width:40px"></span></div>
<div class="pad" id="jMentorProfileBody"></div>`);

renderers["jMentorProfile"] = () => {
  const m = S.matched;
  if (!m) { show("jHome"); return; }
  const left = trialDaysLeft();
  const bigAv = m.photo
    ? `<div class="avatar" style="width:96px;height:96px;border-radius:50%;background-image:url('${esc(m.photo)}');margin:0 auto"></div>`
    : `<div class="avatar" style="width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--pink));display:grid;place-items:center;font-size:44px;margin:0 auto">${genderEmoji(m.gender)}</div>`;

  document.getElementById("jMentorProfileBody").innerHTML = `
    <div class="center" style="margin-top:8px">
      ${bigAv}
      <div style="font-weight:800;font-size:20px;margin-top:10px">${esc(m.name)}</div>
      <div class="muted">${esc(m.branch)} · ${esc(m.year)}</div>
      <div class="muted" style="font-size:12.5px;margin-top:2px">📍 ${esc(m.college)}</div>
    </div>
    <div class="pill-list" style="margin-top:14px;justify-content:center">${(m.skills || []).map(s => `<span class="tag">${esc(s)}</span>`).join("")}</div>
    ${(m.ach && m.ach.length) ? `<div class="section-t">Achievements</div>${m.ach.map(a => `<div style="font-size:14px;margin:3px 0">✦ ${esc(a)}</div>`).join("")}` : ""}
    ${m.bio ? `<div class="section-t">About</div><div style="font-size:14px;line-height:1.55">${esc(m.bio)}</div>` : ""}
    ${m.linkedin ? `<div class="hr"></div><div class="kv"><span class="muted">LinkedIn</span><a href="${safeUrl(m.linkedin)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary-dark);font-weight:700">View profile ↗</a></div>` : ""}
    <div class="hr"></div>
    ${left > 0
      ? `<div class="profcard" style="padding:14px;background:var(--lav-soft)">
           <div style="font-weight:700;font-size:14px">🗓️ 1-week trial in progress</div>
           <div class="muted" style="font-size:12.5px;margin-top:4px">Give guidance a fair trial! You can switch mentors after <b>${left} day${left > 1 ? "s" : ""}</b>.</div>
         </div>
         <button class="btn btn-ghost" style="margin-top:12px;opacity:.55;cursor:not-allowed" onclick="toast('Available after 1-week trial (${left} day${left > 1 ? 's' : ''} remaining)')">🔒 Change mentor (in ${left} day${left > 1 ? "s" : ""})</button>`
      : `<button class="btn btn-ghost" onclick="unmatch()">Change mentor / End mentorship</button>`}
  `;
};

async function unmatch() {
  if (trialDaysLeft() > 0) { toast("Available after the 1-week trial period"); return; }
  if (S.matchId) await dbEndMatch(S.matchId);
  S.matched = null;
  S.matchedAt = null;
  S.matchId = null;
  clearMatchLS();
  toast("Mentorship ended");
  await buildDeck();
  show("jHome");
}

/* 13. Junior Profile Screen */
reg("jProfile", `
<div class="topbar"><span class="t">My Profile 🎓</span><span class="iconbtn" title="Log out" onclick="logout()">⎋</span></div>
<div class="pad" id="jProfileBody"></div>
<div class="tabbar">
  <div class="tab" onclick="show('jHome')"><span class="i">🔥</span>Discover</div>
  <div class="tab" onclick="show('jMatch')"><span class="i">💬</span>My mentor</div>
  <div class="tab on" onclick="show('jProfile')"><span class="i">👤</span>My Profile</div>
</div>`);

renderers["jProfile"] = () => {
  const jp = S.juniorProfile || {};
  document.getElementById("jProfileBody").innerHTML = `
    <div class="banner">📍 ${esc(S.college)} · 🎓 Junior Account</div>
    <div class="profcard">
      <div class="row">
        <div class="avatar editable" onclick="changeJuniorPhoto()" style="${jp.photo ? `background-image:url('${esc(jp.photo)}')` : `background:linear-gradient(135deg,var(--pink),var(--primary));display:grid;place-items:center;color:#fff;font-size:24px`}">${jp.photo ? "" : (esc(S.name[0]) || "J").toUpperCase()}<span class="cam-badge">📷</span></div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:18px">${esc(S.name)}</div>
          <div class="muted" style="font-size:13px">${esc(jp.branch || "Student")} · ${esc(jp.year || "1st Year")}</div>
          <div class="muted" style="font-size:12px;margin-top:2px">${esc(S.email)}</div>
        </div>
      </div>
      <div class="pill-list" style="margin-top:10px">${(jp.skills || []).map(s => `<span class="tag">${esc(s)}</span>`).join("")}</div>
    </div>

    <h3 style="margin:22px 0 6px">Edit Profile Details</h3>
    <p class="muted" style="margin:0 0 12px;font-size:13px">Tap the photo above to upload your picture 📷</p>

    <label class="fld">Full name</label>
    <input id="jEditName" value="${esc(S.name)}">

    <div class="grid2">
      <div>
        <label class="fld">Branch</label>
        <select id="jEditBranch"></select>
      </div>
      <div>
        <label class="fld">Year</label>
        <select id="jEditYear">
          <option>1st Year</option>
          <option>2nd Year</option>
          <option>3rd Year</option>
        </select>
      </div>
    </div>

    <label class="fld">What topics do you want guidance on?</label>
    <div class="chips" id="jEditSkills"></div>

    <label class="fld">About you / Goals</label>
    <textarea id="jEditBio" rows="4" placeholder="Share what you are curious about, your goals, or what guidance you need...">${esc(jp.bio || "")}</textarea>

    <button class="btn btn-primary" id="btnSaveJunior" style="margin-top:20px" onclick="saveJuniorProfile()">Save Profile Changes</button>
    <button class="btn btn-ghost" style="margin:12px 0 30px" onclick="logout()">Log out</button>
  `;

  const b = document.getElementById("jEditBranch");
  BRANCHES.forEach(x => {
    const opt = new Option(x, x);
    if (x === jp.branch) opt.selected = true;
    b.add(opt);
  });
  if (jp.year) document.getElementById("jEditYear").value = jp.year;

  const sk = document.getElementById("jEditSkills");
  const selectedSkills = new Set(jp.skills || []);
  SKILL_BANK.forEach(s => {
    const c = document.createElement("span");
    c.className = "chip" + (selectedSkills.has(s) ? " on" : "");
    c.textContent = s;
    c.onclick = () => c.classList.toggle("on");
    sk.appendChild(c);
  });
};

function changeJuniorPhoto() {
  const inp = document.getElementById("homePhotoInput");
  inp.onchange = async e => {
    const file = e.target.files && e.target.files[0];
    readFileToCropper(file, async data => {
      const finalUrl = await uploadPhotoIfPossible(data, S.email);
      if (!S.juniorProfile) S.juniorProfile = {};
      S.juniorProfile.photo = finalUrl;
      saveMeLS();
      if (renderers["jProfile"]) renderers["jProfile"]();
      if (DB) {
        await dbUpdateJuniorPassword(S.email, btoa(finalUrl)); // also updates junior
        try {
          await DB.from("juniors").update({ photo: finalUrl }).eq("email", S.email);
        } catch(err) {}
      }
      toast("📷 Profile photo updated!");
    });
    e.target.value = "";
  };
  inp.click();
}

async function saveJuniorProfile() {
  const newName = (document.getElementById("jEditName").value || "").trim();
  const branch = document.getElementById("jEditBranch").value;
  const year = document.getElementById("jEditYear").value;
  const bio = (document.getElementById("jEditBio").value || "").trim();
  const chosenSkills = [...document.querySelectorAll("#jEditSkills .chip.on")].map(c => c.textContent);

  if (newName) S.name = newName;
  if (!S.juniorProfile) S.juniorProfile = {};
  S.juniorProfile.branch = branch;
  S.juniorProfile.year = year;
  S.juniorProfile.bio = bio;
  S.juniorProfile.skills = chosenSkills;

  const btn = document.getElementById("btnSaveJunior");
  btn.disabled = true;
  btn.textContent = "Saving...";

  saveMeLS();

  if (DB) {
    try {
      await dbAddJunior({
        name: S.name,
        email: S.email,
        college: S.college,
        branch: branch,
        year: year,
        bio: bio,
        skills: chosenSkills,
        photo: S.juniorProfile.photo || ""
      });
      if (S.matchId) {
        await DB.from("matches").update({ junior_name: S.name }).eq("id", S.matchId);
      }
    } catch (e) {
      console.warn("Junior profile save error:", e);
    }
  }

  btn.disabled = false;
  btn.textContent = "Save Profile Changes";
  toast("✅ Profile updated!");
  if (renderers["jProfile"]) renderers["jProfile"]();
}

/* ============ SESSION & LOGOUT ============ */
function logout() {
  try {
    clearMatchLS();
    localStorage.removeItem("kootu_me");
    if (DB && DB.auth) DB.auth.signOut();
  } catch (e) {}
  _photoData = "";
  S = {
    role: null, authMode: "login", college: null, name: "Guest", email: "",
    mentorProfile: { branch: "", year: "", gender: "", skills: [], qual: "", ach: [], linkedin: "", photo: "", bio: "", capacity: 2 },
    juniorProfile: { branch: "Computer Science", year: "1st Year", skills: [], bio: "", photo: "" },
    deck: [], allDeck: [], idx: 0, matched: null, matchedAt: null, matchId: null, activeMentee: null, chat: []
  };
  show("welcome");
  toast("Logged out 👋");
}

function autoResume() {
  const me = loadMeLS();
  if (me && me.email) {
    S.email = me.email;
    S.name = me.name || "Student";
    S.college = me.college;
    S.role = me.role;
    if (me.role === "mentor" && me.profile) {
      S.mentorProfile = me.profile;
      _photoData = me.profile.photo || "";
      show("mHome");
      return true;
    } else if (me.role === "junior") {
      if (me.juniorProfile) S.juniorProfile = me.juniorProfile;
      restoreJuniorMatch().then(() => {
        buildDeck().then(() => show("jHome"));
      });
      return true;
    }
  }
  return false;
}

/* Register Service Worker */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

/* ============ INITIALIZATION ============ */
loadMatchLS();
if (!autoResume()) show("welcome");
dbLoadColleges();
initCropper();
