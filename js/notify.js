// notify.js — toast, Notification API, SpeechSynthesis (kk-KZ → ru-RU → WebAudio beep), toggle
import { showToast as utilToast } from "./utils.js";

let voiceEnabled = false;
let audioCtx = null;
let voicesCache = [];

// Load voices async
function loadVoices() {
  try {
    voicesCache = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  } catch {}
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

export function isVoiceEnabled() {
  return voiceEnabled;
}

export function setVoiceEnabled(v) {
  voiceEnabled = !!v;
  try {
    localStorage.setItem("smart-bjb:voiceEnabled", voiceEnabled ? "1" : "0");
  } catch {}
  // Warm up speech on user gesture (required for autoplay policy)
  if (voiceEnabled) warmUpSpeech();
}

export function initVoiceToggle() {
  try {
    const saved = localStorage.getItem("smart-bjb:voiceEnabled");
    voiceEnabled = saved === "1";
  } catch {}
  return voiceEnabled;
}

function warmUpSpeech() {
  try {
    if (!window.speechSynthesis) return;
    // Create a silent utterance to unlock speech on some browsers
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {}
}

export function showLiveToast(name) {
  const msg = `${name} сайттан шықты`;
  // In-page banner/toast
  utilToast(msg, 5000);
  // Also show a prominent banner element if present
  const banner = document.getElementById("live-banner");
  if (banner) {
    banner.textContent = `⚠️ ${msg}`;
    banner.classList.remove("hidden");
    clearTimeout(banner._hideTimer);
    banner._hideTimer = setTimeout(() => banner.classList.add("hidden"), 6000);
  }
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    utilToast("Браузер хабарламаны қолдамайды");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    utilToast("Хабарламаға рұқсат берілмеген (браузер баптауынан қосыңыз)");
    return false;
  }
  try {
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch {
    return false;
  }
}

export function sendBrowserNotification(name) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification("Smart-БЖБ/ТЖБ", {
      body: `${name} сайттан шықты`,
      icon: "",
      tag: `leave-${Date.now()}`,
    });
    n.onclick = () => window.focus();
    setTimeout(() => n.close(), 6000);
  } catch {}
}

function pickVoice(preferredLang) {
  if (!voicesCache.length) loadVoices();
  // Try exact lang, then prefix
  let v = voicesCache.find((x) => x.lang === preferredLang);
  if (v) return v;
  v = voicesCache.find((x) => x.lang.startsWith(preferredLang.split("-")[0]));
  if (v) return v;
  return null;
}

function beepFallback() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(g);
    g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    o.start();
    o.stop(audioCtx.currentTime + 0.42);
  } catch {}
}

export function speakLeave(name) {
  if (!voiceEnabled) return;
  const text = `${name} сайттан шықты`;
  if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) {
    beepFallback();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    // Try kk-KZ, fallback ru-RU
    const kkVoice = pickVoice("kk-KZ");
    const ruVoice = pickVoice("ru-RU");
    if (kkVoice) {
      u.voice = kkVoice;
      u.lang = kkVoice.lang;
    } else if (ruVoice) {
      u.voice = ruVoice;
      u.lang = ruVoice.lang;
    } else {
      u.lang = "kk-KZ";
    }
    u.rate = 1;
    u.volume = 1;
    let fallbackTimer = setTimeout(() => {
      // If no voice is available, fallback to beep after short delay
      // We detect by checking if speaking didn't start? Simple heuristic: if no voices at all
      if (!voicesCache.length) beepFallback();
    }, 600);

    u.onend = () => clearTimeout(fallbackTimer);
    u.onerror = () => {
      clearTimeout(fallbackTimer);
      beepFallback();
    };
    window.speechSynthesis.speak(u);
    // If voices empty and speak does nothing, beep will still play via fallback timer
  } catch {
    beepFallback();
  }
}

// Combined handler for a new "left" event
export function notifyLeave(name) {
  showLiveToast(name);
  sendBrowserNotification(name);
  speakLeave(name);
}
