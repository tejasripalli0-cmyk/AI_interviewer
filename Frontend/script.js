/* ═══════════════════════════════════════════════════════════
   Emma AI Interviewer — Frontend Logic
   ═══════════════════════════════════════════════════════════ */

// ── CONFIG ─────────────────────────────────────────────────
const BACKEND_BASE_URL = "https://ai-interviewer-assistant-38on.onrender.com";   // Leave blank — uses same host automatically
const INTERVIEW_DURATION = 15 * 60; // 15 minutes in seconds

// ── ROLES ──────────────────────────────────────────────────
const ROLES = [
  "AI/ML Engineer",
  "Data Analyst",
  "Data Scientist",
  "Software Developer",
  "Software Engineer",
  "Python Developer",
  "DevOps Engineer",
  "Full Stack Developer",
  "Frontend Developer",
  "Backend Developer",
  "Cloud Engineer",
  "Cybersecurity Analyst"
];

// ── STATE ───────────────────────────────────────────────────
let sessionId         = "";
let initialQuestion   = "";
let currentTranscript = "";
let timerInterval     = null;
let secondsLeft       = INTERVIEW_DURATION;
let questionCount     = 0;
let interviewStarted  = false;
let recognition       = null;
let isListening       = false;

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // Start button
  document.getElementById("startBtn").addEventListener("click", startInterview);

  // Role autocomplete
  document.getElementById("roleInput").addEventListener("input", function () {
    const val = this.value.toLowerCase().trim();
    const dd  = document.getElementById("roleDropdown");
    dd.innerHTML = "";
    if (!val) return;

    const matches = ROLES.filter(r => r.toLowerCase().includes(val));
    matches.forEach(role => {
      const div = document.createElement("div");
      div.className = "role-item";
      div.textContent = role;
      div.onclick = () => {
        document.getElementById("roleInput").value = role;
        dd.innerHTML = "";
      };
      dd.appendChild(div);
    });
  });

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".field-wrap")) {
      document.getElementById("roleDropdown").innerHTML = "";
    }
  });
});

/* ══════════════════════════════════════════════════════════
   PAGE NAVIGATION
══════════════════════════════════════════════════════════ */
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* ══════════════════════════════════════════════════════════
   PAGE 1 — FILE UPLOAD + ROLE SELECT
══════════════════════════════════════════════════════════ */
function handleFileSelected() {
  const file = document.getElementById("resumeFile").files[0];
  if (!file) return;

  document.getElementById("uploadLabel").textContent = "Resume uploaded!";
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("filePill").classList.remove("hidden");
}

async function startInterview() {
  const file = document.getElementById("resumeFile").files[0];
  const role = document.getElementById("roleInput").value.trim();

  if (!file) { showToast("Please upload your resume first."); return; }
  if (!role)  { showToast("Please select or type a target role."); return; }

  const btn = document.getElementById("startBtn");
  btn.textContent = "Connecting…";
  btn.disabled = true;

  const formData = new FormData();
  formData.append("resume", file);
  formData.append("role", role);

  try {
    const res  = await fetch(`${BACKEND_BASE_URL}/start-interview`, { method: "POST", body: formData });
    const data = await res.json();
    sessionId       = data.session_id;
    initialQuestion = data.question;
    showPage("checkPage");
  } catch (err) {
    console.error(err);
    showToast("Could not reach the backend. Is the server running?");
    btn.textContent = "Begin Interview";
    btn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════════
   PAGE 2 — SCREEN SHARE
══════════════════════════════════════════════════════════ */
async function startScreenShare() {
  try {
    await navigator.mediaDevices.getDisplayMedia({ video: true });

    const dot  = document.querySelector("#shareStatus .status-dot");
    const text = document.getElementById("shareStatusText");
    dot.className  = "status-dot active";
    text.textContent = "Screen sharing active ✓";

    document.getElementById("proceedBtn").classList.remove("hidden");
    document.getElementById("shareBtn").classList.add("hidden");
  } catch (err) {
    showToast("Screen share is required to continue.");
  }
}

function goToHardwarePage() {
  showPage("verificationPage");
}

/* ══════════════════════════════════════════════════════════
   PAGE 3 — HARDWARE CHECK → START
══════════════════════════════════════════════════════════ */
async function initializeLiveInterview() {
  showPage("interviewPage");
  await activateWebcam();
  startTimer();
  postMessage("emma", initialQuestion);
  setEmmaStatus("Speaking…");
  toggleSpeakingRing(true);

  speak(initialQuestion, () => {
    toggleSpeakingRing(false);
    setEmmaStatus("Listening to you…");
    autoActivateMic();
  });
}

/* ══════════════════════════════════════════════════════════
   WEBCAM
══════════════════════════════════════════════════════════ */
async function activateWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    document.getElementById("webcam").srcObject = stream;
  } catch {
    console.warn("Webcam unavailable.");
  }
}

/* ══════════════════════════════════════════════════════════
   TIMER
══════════════════════════════════════════════════════════ */
function startTimer() {
  secondsLeft = INTERVIEW_DURATION;
  timerInterval = setInterval(() => {
    secondsLeft--;
    const m = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const s = String(secondsLeft % 60).padStart(2, "0");
    document.getElementById("timerDisplay").textContent = `${m}:${s}`;

    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      endInterview();
    }
  }, 1000);
}

/* ══════════════════════════════════════════════════════════
   SPEECH SYNTHESIS (Emma speaks)
══════════════════════════════════════════════════════════ */
function speak(text, onDone) {
  if (!('speechSynthesis' in window)) { onDone && onDone(); return; }

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);

  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.includes("Google US English") ||
      v.name.includes("Samantha") ||
      v.name.includes("Zira") ||
      (v.lang === "en-US" && v.name.toLowerCase().includes("female"))
    ) || voices.find(v => v.lang === "en-US") || voices[0];

    if (preferred) utter.voice = preferred;
    utter.rate  = 0.92;
    utter.pitch = 1.1;

    utter.onend = () => { onDone && onDone(); };
    window.speechSynthesis.speak(utter);
  };

  if (window.speechSynthesis.getVoices().length > 0) {
    trySpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = trySpeak;
  }
}

/* ══════════════════════════════════════════════════════════
   SPEECH RECOGNITION (User speaks)
══════════════════════════════════════════════════════════ */
function autoActivateMic() {
  showSpeakButton(true);
  setMicStatus("🎤 Your turn — tap below to answer", true);
  setFooterHint("Your turn to speak. Tap the button or it activates in 3 seconds…");

  setTimeout(() => {
    if (!isListening) startListening();
  }, 3000);
}

function startListening() {
  if (isListening) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast("Speech recognition not supported. Use Chrome or Edge."); return; }

  recognition = new SR();
  recognition.lang         = "en-US";
  
  // ── MIC DROP FIXES: Setup continuous recording parameters
  recognition.continuous    = true;          
  recognition.interimResults = true;          

  isListening = true;
  currentTranscript = "";

  const btn = document.getElementById("speakBtn");
  btn.textContent = "● Recording…";
  btn.classList.add("listening");

  setMicStatus("🔴 Recording active — speak freely", true);
  setFooterHint("Recording your answer. Click 'Submit Answer' when completely finished.");
  document.getElementById("submitBtn").classList.remove("hidden");

  // Keep track of finalized sentence segments securely
  let finalTranscript = "";

  recognition.onresult = (e) => {
    let interimTranscript = "";

    // Iterate through incoming multi-chunk voice streaming results
    for (let i = e.resultIndex; i < e.results.length; ++i) {
      if (e.results[i].isFinal) {
        finalTranscript += e.results[i][0].transcript + " ";
      } else {
        interimTranscript += e.results[i][0].transcript;
      }
    }

    // Accumulate history and stream live tokens seamlessly to layout bubble
    currentTranscript = finalTranscript + interimTranscript;

    let liveEl = document.getElementById("liveTranscript");
    if (!liveEl) {
      liveEl = document.createElement("div");
      liveEl.id = "liveTranscript";
      liveEl.className = "chat-msg user";
      liveEl.innerHTML = `<span class="sender">You</span><div class="bubble"></div>`;
      document.getElementById("chatBox").appendChild(liveEl);
    }
    liveEl.querySelector(".bubble").textContent = currentTranscript;
    scrollChat();
  };

  recognition.onerror = (e) => {
    console.error("Recognition error:", e.error);
    if (e.error !== 'no-speech') {
      isListening = false;
    }
  };

  recognition.onend = () => {
    // Reconnect guard if browser engine cuts stream before submit is clicked
    if (isListening) {
      try { recognition.start(); } catch(err) {}
    } else {
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Tap to Speak`;
      btn.classList.remove("listening");
    }
  };

  recognition.start();
}

async function submitCurrentAnswer() {
  isListening = false; // Disables re-start hook on matching connection end
  if (recognition) { recognition.stop(); }

  const answer = currentTranscript.trim();
  if (!answer) { showToast("No answer recorded yet — please speak first."); return; }

  const live = document.getElementById("liveTranscript");
  if (live) live.remove();

  postMessage("user", answer);
  currentTranscript = "";

  showSpeakButton(false);
  document.getElementById("submitBtn").classList.add("hidden");
  setMicStatus("Processing…", false);
  setFooterHint("Evaluating your answer...");
  setEmmaStatus("Thinking…");
  questionCount++;

  try {
    const res  = await fetch(`${BACKEND_BASE_URL}/submit-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, answer })
    });
    const data = await res.json();

    const next = data.next_question;
    postMessage("emma", next);

    if (data.stage === "TECH") {
      document.getElementById("stageBadge").textContent = "Technical Round";
    }

    setEmmaStatus("Speaking…");
    toggleSpeakingRing(true);

    speak(next, () => {
      toggleSpeakingRing(false);
      setEmmaStatus("Listening to you…");
      autoActivateMic();
    });

  } catch (err) {
    console.error(err);
    showToast("Error contacting backend.");
    setEmmaStatus("Error — retrying…");
  }
}

/* ══════════════════════════════════════════════════════════
   END INTERVIEW
══════════════════════════════════════════════════════════ */
function endInterview() {
  isListening = false;
  clearInterval(timerInterval);
  if (recognition) recognition.stop();
  window.speechSynthesis.cancel();

  const elapsed = INTERVIEW_DURATION - secondsLeft;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  // Set values safely for matching end screen targets
  const qStatEl = document.getElementById("statQuestions");
  if (qStatEl) qStatEl.textContent = questionCount;
  
  const dStatEl = document.getElementById("statDuration");
  if (dStatEl) dStatEl.textContent = `${m}m ${s}s`;

  const outro = "Thank you so much for your time today! It was wonderful speaking with you. We'll review your responses and be in touch soon. Best of luck — we're rooting for you!";
  speak(outro, () => showPage("endPage"));

  setTimeout(() => showPage("endPage"), 8000);
}

/* ══════════════════════════════════════════════════════════
   CHAT HELPERS
══════════════════════════════════════════════════════════ */
function postMessage(who, text) {
  if (who === "user") {
    const live = document.getElementById("liveTranscript");
    if (live) live.remove();
  }

  const el = document.createElement("div");
  el.className = `chat-msg ${who}`;
  el.innerHTML = `
    <span class="sender">${who === "emma" ? "Emma" : "You"}</span>
    <div class="bubble">${escapeHtml(text)}</div>
  `;
  document.getElementById("chatBox").appendChild(el);
  scrollChat();
}

function scrollChat() {
  const box = document.getElementById("chatBox");
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ══════════════════════════════════════════════════════════
   UI STATE HELPERS
══════════════════════════════════════════════════════════ */
function setEmmaStatus(txt) {
  document.getElementById("emmaStatus").textContent = txt;
}
function setMicStatus(txt, on) {
  const el = document.getElementById("micStatus");
  el.textContent = txt;
  el.className = "mic-status" + (on ? " on" : "");
}
function setFooterHint(txt) {
  document.getElementById("footerHint").textContent = txt;
}
function toggleSpeakingRing(active) {
  const ring = document.getElementById("emmaSpeaking");
  ring.classList.toggle("active", active);
}
function showSpeakButton(show) {
  document.getElementById("speakBtn").classList.toggle("hidden", !show);
  document.getElementById("footerHint").classList.toggle("hidden", show);
}

function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    Object.assign(toast.style, {
      position: "fixed", bottom: "32px", left: "50%", transform: "translateX(-50%)",
      background: "#1e293b", border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "10px", padding: "12px 22px",
      color: "#f1f5f9", fontSize: "0.88rem", zIndex: "999",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)", transition: "opacity 0.3s"
    });
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = "1";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = "0"; }, 3000);
}
