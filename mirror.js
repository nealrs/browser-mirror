const api = globalThis.browser ?? chrome;
const isFirefox = api.runtime.getURL('').startsWith('moz-extension://');

const video      = document.getElementById('video');
const blocker    = document.getElementById('blocker');
const blockerMsg = document.getElementById('blockerMsg');
const grantBtn   = document.getElementById('grantBtn');
const settingsRow = document.getElementById('settingsRow');
const settingsUrl = document.getElementById('settingsUrl');
const copyBtn     = document.getElementById('copyBtn');
const camDot     = document.getElementById('camDot');
const camLabel   = document.getElementById('camLabel');
const camRes     = document.getElementById('camRes');
const micDot     = document.getElementById('micDot');
const micLabel   = document.getElementById('micLabel');
const segs       = document.querySelectorAll('.seg');

let analyser = null;

// ── Helpers ──────────────────────────────────────────────────
const setLive = dot => { dot.classList.remove('err');  dot.classList.add('live'); };
const setErr  = dot => { dot.classList.remove('live'); dot.classList.add('err');  };

// "FaceTime HD Camera (Built-in)" → "FaceTime HD Camera"
const trim = label =>
  label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label;

// ── Audio meter loop ─────────────────────────────────────────
function runMeter() {
  if (!analyser) return;
  const buf = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(buf);
  const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
  const lvl = Math.min(avg / 46, 1);          // normalize to 0–1
  const n   = Math.round(lvl * segs.length);
  segs.forEach((s, i) => s.classList.toggle('on', i < n));
  requestAnimationFrame(runMeter);
}

// ── Blocked state ─────────────────────────────────────────────
// Chrome never shows the camera/mic permission prompt inside a
// toolbar popup — the grant has to happen in a regular tab first.
// getCurrent() returns the tab in a tab context, undefined in a popup.
async function showBlocked() {
  const inTab = !!(await api.tabs.getCurrent());

  blocker.style.display  = 'flex';
  video.style.display    = 'none';
  grantBtn.style.display = 'inline-block';

  if (!inTab) {
    blockerMsg.textContent =
      'Your browser can’t ask for camera access from a popup. Open Mirror in a tab to grant it.';
    grantBtn.textContent = 'Open in a tab';
    grantBtn.onclick = async () => {
      await api.tabs.create({ url: api.runtime.getURL('mirror.html') });
      window.close();
    };
  } else {
    blockerMsg.textContent = isFirefox
      ? 'Camera and microphone are blocked. Click below to request access. ' +
        'If no prompt appears, click the padlock icon in the address bar, open ' +
        'Permissions, and allow Camera and Microphone.'
      : 'Camera and microphone are blocked. Click below to request access. ' +
        'If no prompt appears, click the camera icon at the right end of the ' +
        'address bar and choose Always allow — or use the settings link below.';
    grantBtn.textContent = 'Request access';
    grantBtn.onclick = () => {
      // Retry from a real user gesture — re-fires the permission prompt
      // when the state is still "ask" (e.g. a dismissed prompt).
      blocker.style.display  = 'none';
      grantBtn.style.display = 'none';
      video.style.display    = 'block';
      start();
    };

    // Per-site settings deep link for this extension's origin. Extensions
    // can't open chrome:// pages themselves, so we surface it to paste.
    // Chrome-only: Firefox has no equivalent per-site settings URL.
    if (!isFirefox) {
      const url = `chrome://settings/content/siteDetails?site=${api.runtime.getURL('').slice(0, -1)}`;
      settingsUrl.textContent = url;
      settingsRow.style.display = 'flex';
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);
          copyBtn.textContent = 'Copied ✓';
        } catch (_) {
          copyBtn.textContent = 'Press ⌘C';
        }
      };
    }
  }
}

// ── Start camera + mic ────────────────────────────────────────
async function start() {
  let stream;

  // Ask for a widescreen capture (cameras often default to 4:3)
  const videoConstraints = {
    width:  { ideal: 1920 },
    height: { ideal: 1080 }
  };

  // Try camera + mic together
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: true });
  } catch (_) {
    // Mic may have been denied — try camera only
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      setErr(micDot);
      micLabel.textContent = 'Mic blocked';
    } catch (e) {
      // Camera totally blocked
      setErr(camDot);
      setErr(micDot);
      camLabel.textContent = 'Camera blocked';
      micLabel.textContent = 'Mic blocked';
      await showBlocked();
      return;
    }
  }

  // ── Camera ─────────────────────────────────────────────────
  const vt = stream.getVideoTracks()[0];
  video.srcObject = stream;

  if (vt) {
    setLive(camDot);
    camLabel.textContent = trim(vt.label) || 'Camera';
  }

  video.addEventListener('loadedmetadata', () => {
    if (video.videoWidth) {
      camRes.textContent = `${video.videoWidth}×${video.videoHeight}`;
    }
  }, { once: true });

  // ── Mic ────────────────────────────────────────────────────
  const at = stream.getAudioTracks()[0];
  if (at) {
    setLive(micDot);
    micLabel.textContent = trim(at.label) || 'Microphone';
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    runMeter();
  }
}

start();
