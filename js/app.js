/* ========================================
   SALUD PEPE - App de control de salud
   Firebase + IndexedDB
   ======================================== */

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyCjNPsxRsjNKRMOcwIG5JlflJ_6J49hLDU",
  authDomain: "pepe-2026.firebaseapp.com",
  projectId: "pepe-2026",
  storageBucket: "pepe-2026.firebasestorage.app",
  messagingSenderId: "882599429252",
  appId: "1:882599429252:web:bcc52c3b11635715356ed1",
  measurementId: "G-DE7Z3ZE0DV"
};

firebase.initializeApp(firebaseConfig);
const fs = firebase.firestore();
const auth = firebase.auth();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

let userId = null;
const CLOUD_ENABLED = true;

// ===== ONLINE/OFFLINE DETECTION =====
function isOnline() { return navigator.onLine; }

window.addEventListener('online', () => updateSyncBadge());
window.addEventListener('offline', () => updateSyncBadge());

function updateSyncBadge(el) {
  const badge = document.getElementById('syncStatus');
  if (!badge) return;
  if (!isOnline()) {
    badge.textContent = '📵';
    badge.className = 'sync-badge sync-offline';
    badge.title = 'Sin conexión - datos locales';
  } else {
    badge.textContent = '☁️';
    badge.className = 'sync-badge sync-online';
    badge.title = 'Conectado - datos en la nube';
  }
}

// ===== INIT FIREBASE AUTH =====
async function initFirebase() {
  try {
    const cred = await auth.signInAnonymously();
    userId = cred.user.uid;
    console.log('Firebase OK:', userId);
    return true;
  } catch (e) {
    console.warn('Firebase auth falló, modo offline:', e.message);
    userId = 'offline';
    return false;
  }
}

// ===== INDEXED DB (caché local) =====
const DB_NAME = 'SaludPepeDB';
const DB_VERSION = 3;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      ['glucose', 'medications', 'vitals', 'config'].forEach(s => {
        if (!db.objectStoreNames.contains(s)) {
          const store = db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbLocalAdd(store, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).add(data);
    req.onsuccess = () => { tx.commit(); resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function dbLocalPut(store, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(data);
    req.onsuccess = () => { tx.commit(); resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function dbLocalGetAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbLocalDelete(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(id);
    req.onsuccess = () => { tx.commit(); resolve(); };
    req.onerror = () => reject(req.error);
  });
}

async function dbLocalClear(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => { tx.commit(); resolve(); };
    req.onerror = () => reject(req.error);
  });
}

async function dbLocalGetConfig(key) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('config', 'readonly');
    const req = tx.objectStore('config').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => resolve(null);
  });
}

async function dbLocalSetConfig(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('config', 'readwrite');
    tx.objectStore('config').put({ id: key, key, value });
    req = tx.objectStore('config').put({ key, value });
    tx.commit();
    resolve();
  });
}

// ===== CLOUD DB (Firestore) =====
function col(name) { return fs.collection(name); }

async function dbCloudAdd(collection, data) {
  if (!CLOUD_ENABLED || !isOnline()) return null;
  try {
    const ref = await col(collection).add({ ...data, userId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    return ref.id;
  } catch (e) { console.warn('Cloud add error:', e.message); return null; }
}

async function dbCloudGetAll(collection) {
  if (!CLOUD_ENABLED || !isOnline()) return null;
  try {
    const snap = await col(collection).where('userId', '==', userId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn('Cloud get error:', e.message); return null; }
}

async function dbCloudDelete(collection, id) {
  if (!CLOUD_ENABLED || !isOnline()) return false;
  try {
    await col(collection).doc(id).delete();
    return true;
  } catch (e) { console.warn('Cloud delete error:', e.message); return false; }
}

// ===== SYNC LAYER =====
let syncQueue = [];

async function syncFromCloud() {
  if (!isOnline()) return;
  const badge = document.getElementById('syncStatus');
  if (badge) { badge.textContent = '🔄'; badge.className = 'sync-badge sync-syncing'; }

  for (const c of ['glucose', 'medications', 'vitals']) {
    const cloudData = await dbCloudGetAll(c);
    if (cloudData) {
      await dbLocalClear(c);
      for (const item of cloudData) {
        await dbLocalPut(c, { ...item, _cloud: true });
      }
    }
  }
  updateSyncBadge();
}

async function saveWithSync(collection, data) {
  // Save locally first (instant)
  const localId = await dbLocalAdd(collection, data);
  const saved = { id: localId, ...data, _cloud: false };

  // Save to cloud
  const cloudId = await dbCloudAdd(collection, data);
  if (cloudId) {
    saved._cloud = true;
    saved.cloudId = cloudId;
    await dbLocalPut(collection, saved);
  }
  return saved;
}

async function deleteWithSync(collection, localId, cloudId) {
  await dbLocalDelete(collection, localId);
  if (cloudId) await dbCloudDelete(collection, cloudId);
}

async function getAllData(collection) {
  const local = await dbLocalGetAll(collection);
  if (local.length > 0) return local;
  // Try cloud
  if (isOnline()) {
    const cloud = await dbCloudGetAll(collection);
    if (cloud) {
      await dbLocalClear(collection);
      for (const item of cloud) {
        await dbLocalPut(collection, { ...item, _cloud: true });
      }
      return cloud;
    }
  }
  return [];
}

// ===== UTILIDADES =====
function today() { return new Date().toISOString().split('T')[0]; }
function nowTime() { return new Date().toTimeString().slice(0, 5); }

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function diaSemana() {
  const d = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const m = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const n = new Date();
  return `${d[n.getDay()]} ${n.getDate()} de ${m[n.getMonth()]} del ${n.getFullYear()}`;
}

// ===== TOAST =====
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, 3000);
}

// ===== NAVEGACIÓN =====
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  const navBtn = document.querySelector('.nav-btn[data-page="' + page + '"]');
  if (navBtn) navBtn.classList.add('active');

  const titles = { dashboard:'Resumen', glucose:'Glucosa', meds:'Medicamentos', vitals:'Vitales', config:'Configuración' };
  const icons = { dashboard:'📊', glucose:'🩸', meds:'💊', vitals:'🌡️', config:'⚙️' };
  document.getElementById('headerTitle').textContent = titles[page] || 'Salud Pepe';
  document.getElementById('headerIcon').textContent = icons[page] || '❤️';

  document.getElementById('appContent').scrollTop = 0;

  if (page === 'dashboard') updateDashboard();
  if (page === 'glucose') updateGlucoseHistory();
  if (page === 'meds') renderMeds();
  if (page === 'vitals') updateVitalsHistory();
  if (page === 'config') loadConfig();
}

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('glucoseDate').value = today();
  document.getElementById('glucoseTime').value = nowTime();
  document.getElementById('vitalsDate').value = today();
  document.getElementById('vitalsTime').value = nowTime();

  // Init Firebase
  await initFirebase();
  updateSyncBadge();
  await syncFromCloud();

  // Glucose quick buttons
  document.querySelectorAll('.quick-glucose').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.quick-glucose').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('glucoseValue').value = btn.dataset.value;
      updateGlucoseStatus(parseInt(btn.dataset.value));
    });
  });

  document.getElementById('glucoseValue').addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    if (v) updateGlucoseStatus(v);
    else document.getElementById('glucoseStatus').style.display = 'none';
  });

  document.querySelectorAll('.quick-vital').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.parentElement;
      group.querySelectorAll('.quick-vital').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (btn.dataset.temp) document.getElementById('tempValue').value = btn.dataset.temp;
      if (btn.dataset.oxygen) document.getElementById('oxygenValue').value = btn.dataset.oxygen;
    });
  });

  document.getElementById('saveGlucose').addEventListener('click', saveGlucose);
  document.getElementById('saveMed').addEventListener('click', saveMedication);
  document.getElementById('saveVitals').addEventListener('click', saveVitals);

  // Config btn
  document.getElementById('configBtn').addEventListener('click', () => navigateTo('config'));

  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    updateDashboard();
    checkReminders();
    setInterval(checkReminders, 60000);
  }, 800);
});

// ===== GLUCOSA =====
function updateGlucoseStatus(value) {
  const el = document.getElementById('glucoseStatus');
  if (value < 70) {
    el.className = 'glucose-status danger';
    el.textContent = '⚠️ ¡Hipoglucemia! Nivel bajo. Consulta a tu médico.';
    el.style.display = 'block';
  } else if (value <= 140) {
    el.className = 'glucose-status success';
    el.textContent = '✅ Nivel normal. ¡Sigue así!';
    el.style.display = 'block';
  } else if (value <= 180) {
    el.className = 'glucose-status warning';
    el.textContent = '⚠️ Nivel ligeramente elevado. Monitorea.';
    el.style.display = 'block';
  } else {
    el.className = 'glucose-status danger';
    el.textContent = '🔴 Nivel alto. Consulta con tu médico.';
    el.style.display = 'block';
  }
}

async function saveGlucose() {
  const value = parseInt(document.getElementById('glucoseValue').value);
  const date = document.getElementById('glucoseDate').value;
  const time = document.getElementById('glucoseTime').value;
  const notes = document.getElementById('glucoseNotes').value.trim();

  if (!value || value < 20 || value > 600) {
    showToast('❌ Ingresa un valor válido (20-600 mg/dL)');
    return;
  }

  const record = { value, date, time, notes, timestamp: date + 'T' + time + ':00' };
  await saveWithSync('glucose', record);

  showToast('✅ Glucosa registrada');
  document.getElementById('glucoseValue').value = '';
  document.getElementById('glucoseNotes').value = '';
  document.getElementById('glucoseStatus').style.display = 'none';
  document.querySelectorAll('.quick-glucose').forEach(b => b.classList.remove('selected'));
  updateGlucoseHistory();
  updateDashboard();
}

async function updateGlucoseHistory() {
  const all = await getAllData('glucose');
  all.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  const todayRecords = all.filter(r => r.date === today());
  const todayEl = document.getElementById('glucoseTodayList');
  const allEl = document.getElementById('glucoseAllList');

  if (todayRecords.length === 0) {
    todayEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🩸</div><p>No hay registros de glucosa hoy</p></div>';
  } else {
    todayEl.innerHTML = todayRecords.map(r =>
      '<div class="history-item"><div class="item-main"><span class="item-value">' + r.value + ' mg/dL</span><span class="item-meta">' + r.time + (r.notes ? ' · ' + r.notes : '') + '</span></div><span style="font-size:1.2rem">' + glucoseEmoji(r.value) + '</span></div>'
    ).join('');
  }

  if (all.length === 0) {
    allEl.innerHTML = '<div class="empty-state"><p>Sin registros aún</p></div>';
  } else {
    allEl.innerHTML = all.map(r =>
      '<div class="history-item"><div class="item-main"><span class="item-value">' + r.value + ' mg/dL</span><span class="item-meta">' + formatDate(r.timestamp) + ' ' + r.time + (r.notes ? ' · ' + r.notes : '') + '</span></div><span style="font-size:1.2rem">' + glucoseEmoji(r.value) + '</span></div>'
    ).join('');
  }

  drawGlucoseChart(all);
}

function glucoseEmoji(v) {
  if (v < 70) return '🆘';
  if (v <= 140) return '😊';
  if (v <= 180) return '😐';
  return '😰';
}

// ===== GRÁFICO =====
function drawGlucoseChart(allData) {
  const canvas = document.getElementById('glucoseChart');
  const emptyEl = document.getElementById('chartEmpty');
  const ctx = canvas.getContext('2d');

  const sevenDays = [];
  const d = new Date();
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(d);
    dt.setDate(dt.getDate() - i);
    sevenDays.push(dt.toISOString().split('T')[0]);
  }

  const points = sevenDays.map(date => {
    const dayRecords = allData.filter(r => r.date === date);
    if (dayRecords.length === 0) return null;
    const vals = dayRecords.map(r => r.value);
    const sum = vals.reduce((a, b) => a + b, 0);
    return { date, avg: Math.round(sum / vals.length), count: vals.length };
  });

  const hasData = points.some(p => p !== null);
  if (!hasData) {
    canvas.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  emptyEl.style.display = 'none';

  const w = canvas.width, h = canvas.height;
  const pad = { top: 20, bottom: 30, left: 40, right: 20 };

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#FAFBFA';
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (h - pad.top - pad.bottom) * (1 - i / 4);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(50 + i * 70, pad.left - 5, y + 3);
  }

  // Normal range
  const yMin = pad.top + (h - pad.top - pad.bottom) * (1 - (70 - 50) / (330 - 50));
  const yMax = pad.top + (h - pad.top - pad.bottom) * (1 - (140 - 50) / (330 - 50));
  ctx.fillStyle = 'rgba(42, 157, 143, 0.1)';
  ctx.fillRect(pad.left, yMax, w - pad.left - pad.right, yMin - yMax);

  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const vp = points.map((p, i) => {
    if (!p) return null;
    return { x: pad.left + (i / (points.length - 1)) * plotW, y: pad.top + (1 - (p.avg - 50) / (330 - 50)) * plotH, ...p };
  }).filter(p => p !== null);

  if (vp.length === 0) return;

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#E76F51';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  vp.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Dots
  const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  vp.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#E76F51';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#6B7280';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(dayNames[new Date(p.date).getDay()], p.x, h - 8);

    ctx.fillStyle = '#1A1A2E';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(p.avg, p.x, p.y - 10);
  });
}

// ===== MEDICAMENTOS =====
function addTime(value) {
  const container = document.getElementById('medTimes');
  const row = document.createElement('div');
  row.className = 'time-row';
  row.innerHTML = '<input type="time" class="med-time" value="' + (value || '12:00') + '"><button class="remove-time" onclick="removeTime(this)">✕</button>';
  container.appendChild(row);
}

function removeTime(btn) {
  const container = document.getElementById('medTimes');
  if (container.children.length <= 1) { showToast('❌ Debe haber al menos un horario'); return; }
  btn.parentElement.remove();
}

async function saveMedication() {
  const name = document.getElementById('medName').value.trim();
  const dosage = document.getElementById('medDosage').value.trim();
  const unit = document.getElementById('medUnit').value;
  const notes = document.getElementById('medNotes').value.trim();
  const wa = document.getElementById('medWhatsApp').value.trim();
  const timeInputs = document.querySelectorAll('.med-time');
  const times = Array.from(timeInputs).map(i => i.value).filter(v => v);

  if (!name) { showToast('❌ Ingresa el nombre del medicamento'); return; }
  if (!dosage) { showToast('❌ Ingresa la dosis'); return; }
  if (times.length === 0) { showToast('❌ Agrega al menos un horario'); return; }

  const med = { name, dosage, unit, times, notes, wa };
  await saveWithSync('medications', med);

  showToast('💊 Medicamento guardado');
  document.getElementById('medName').value = '';
  document.getElementById('medDosage').value = '';
  document.getElementById('medNotes').value = '';
  renderMeds();
  updateDashboard();
}

async function renderMeds() {
  const list = document.getElementById('medList');
  const meds = await getAllData('medications');
  meds.sort((a, b) => ((a.times && a.times[0]) || '00:00').localeCompare((b.times && b.times[0]) || '00:00'));

  if (meds.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">💊</div><p>No hay medicamentos registrados</p><p style="font-size:0.8rem;margin-top:0.3rem">Agrega tus medicamentos arriba</p></div>';
    return;
  }

  list.innerHTML = meds.map(m => {
    const nextTime = getNextDoseTime(m.times);
    return '<div class="med-card">' +
      '<div class="med-card-header">' +
        '<div><div class="med-card-name">💊 ' + m.name + '</div><div class="med-card-dosage">' + m.dosage + ' ' + m.unit + (m.notes ? ' · ' + m.notes : '') + '</div></div>' +
        '<button class="btn-delete" onclick="deleteMed(' + (m.id || '0') + ',\'' + (m.cloudId || '') + '\')" style="padding:0.3rem 0.6rem;font-size:0.75rem;width:auto;flex:none">🗑️</button>' +
      '</div>' +
      '<div class="med-card-times">' +
        (m.times || []).map(t => '<span class="med-card-time"' + (t === nextTime ? ' style="background:var(--primary);color:white"' : '') + '>🕐 ' + t + (t === nextTime ? ' ⬅️' : '') + '</span>').join('') +
      '</div>' +
      '<div class="med-card-actions">' +
        '<button class="btn-remind" onclick="sendWhatsApp(\'' + m.name + '\',\'' + m.dosage + ' ' + m.unit + '\',\'' + (m.times || []).join(', ') + '\',\'' + (m.wa || '') + '\')">📲 Recordar por WhatsApp</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function getNextDoseTime(times) {
  if (!times || times.length === 0) return null;
  const now = nowTime();
  const upcoming = times.filter(t => t > now).sort();
  return upcoming.length > 0 ? upcoming[0] : times[0];
}

async function deleteMed(localId, cloudId) {
  if (!localId && localId !== 0) return;
  if (!confirm('¿Eliminar este medicamento?')) return;
  await deleteWithSync('medications', localId, cloudId);
  renderMeds();
  updateDashboard();
  showToast('🗑️ Medicamento eliminado');
}

function sendWhatsApp(name, dosage, times, waNumber) {
  if (!waNumber || waNumber.length < 8) { showToast('❌ Configura un número de WhatsApp en el medicamento'); return; }
  const clean = waNumber.replace(/[^0-9]/g, '');
  const msg = encodeURIComponent('🔔 *Recordatorio Salud Pepe*\n\n💊 *' + name + '*\nDosis: ' + dosage + '\nHorarios: ' + times + '\n\n¡No olvides tomar tu medicamento! 🙏');
  window.open('https://wa.me/' + clean + '?text=' + msg, '_blank');
}

// ===== VITALES =====
async function saveVitals() {
  const temp = parseFloat(document.getElementById('tempValue').value);
  const oxygen = parseInt(document.getElementById('oxygenValue').value);
  const date = document.getElementById('vitalsDate').value;
  const time = document.getElementById('vitalsTime').value;

  if (!temp && !oxygen) { showToast('❌ Ingresa al menos temperatura o SpO₂'); return; }

  const record = { temperature: temp || null, oxygen: oxygen || null, date, time, timestamp: date + 'T' + time + ':00' };
  await saveWithSync('vitals', record);

  showToast('✅ Registro guardado');
  document.getElementById('tempValue').value = '';
  document.getElementById('oxygenValue').value = '';
  document.querySelectorAll('.quick-vital').forEach(b => b.classList.remove('selected'));
  updateVitalsHistory();
  updateDashboard();
}

async function updateVitalsHistory() {
  const all = await getAllData('vitals');
  all.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  const todayRecords = all.filter(r => r.date === today());
  const todayEl = document.getElementById('vitalsTodayList');
  const allEl = document.getElementById('vitalsAllList');

  if (todayRecords.length === 0) {
    todayEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🌡️</div><p>No hay registros hoy</p></div>';
  } else {
    todayEl.innerHTML = todayRecords.map(r => {
      const parts = [];
      if (r.temperature) parts.push('🌡️ ' + r.temperature + '°C');
      if (r.oxygen) parts.push('🫁 ' + r.oxygen + '%');
      return '<div class="history-item"><div class="item-main"><span class="item-value">' + parts.join(' | ') + '</span><span class="item-meta">' + r.time + '</span></div></div>';
    }).join('');
  }

  if (all.length === 0) {
    allEl.innerHTML = '<div class="empty-state"><p>Sin registros aún</p></div>';
  } else {
    allEl.innerHTML = all.map(r => {
      const parts = [];
      if (r.temperature) parts.push('🌡️ ' + r.temperature + '°C');
      if (r.oxygen) parts.push('🫁 ' + r.oxygen + '%');
      return '<div class="history-item"><div class="item-main"><span class="item-value">' + parts.join(' | ') + '</span><span class="item-meta">' + formatDate(r.timestamp) + ' ' + r.time + '</span></div></div>';
    }).join('');
  }
}

// ===== DASHBOARD =====
async function updateDashboard() {
  document.getElementById('todayDate').textContent = diaSemana();

  const allGlucose = await getAllData('glucose');
  const allVitals = await getAllData('vitals');
  const allMeds = await getAllData('medications');

  const todayG = allGlucose.filter(r => r.date === today());
  const todayV = allVitals.filter(r => r.date === today());

  if (todayG.length > 0) {
    const last = todayG[todayG.length - 1];
    document.getElementById('dashGlucose').textContent = last.value + ' mg/dL';
    document.getElementById('dashGlucoseTime').textContent = 'Último: ' + last.time;
    if (todayG.length >= 2) {
      const prev = todayG[todayG.length - 2];
      document.getElementById('dashGlucoseTrend').textContent = last.value > prev.value ? '📈' : last.value < prev.value ? '📉' : '➡️';
    } else {
      document.getElementById('dashGlucoseTrend').textContent = '📌';
    }
  } else {
    document.getElementById('dashGlucose').textContent = '-- mg/dL';
    document.getElementById('dashGlucoseTime').textContent = 'Sin registro hoy';
    document.getElementById('dashGlucoseTrend').textContent = '';
  }

  const lastTemp = todayV.filter(r => r.temperature).pop();
  document.getElementById('dashTemp').textContent = lastTemp ? lastTemp.temperature + ' °C' : '-- °C';
  document.getElementById('dashTempTime').textContent = lastTemp ? 'Último: ' + lastTemp.time : 'Sin registro hoy';

  const lastOxy = todayV.filter(r => r.oxygen).pop();
  document.getElementById('dashOxygen').textContent = lastOxy ? lastOxy.oxygen + ' %' : '-- %';
  document.getElementById('dashOxygenTime').textContent = lastOxy ? 'Último: ' + lastOxy.time : 'Sin registro hoy';

  const now = nowTime();
  let nextMed = null, nextTime = null;
  for (const m of allMeds) {
    for (const t of (m.times || [])) {
      if (t > now && (!nextTime || t < nextTime)) { nextTime = t; nextMed = m; }
    }
  }

  if (nextMed) {
    document.getElementById('dashNextMed').textContent = '💊 ' + nextMed.name;
    document.getElementById('dashNextMedTime').textContent = '⏰ ' + nextMed.dosage + ' ' + nextMed.unit + ' a las ' + nextTime;
  } else if (allMeds.length > 0) {
    const first = allMeds.flatMap(m => (m.times || []).map(t => ({ med: m, time: t }))).sort((a, b) => a.time.localeCompare(b.time))[0];
    if (first) {
      document.getElementById('dashNextMed').textContent = '💊 ' + first.med.name;
      document.getElementById('dashNextMedTime').textContent = 'Mañana ' + first.med.dosage + ' ' + first.med.unit + ' a las ' + first.time;
    } else {
      document.getElementById('dashNextMed').textContent = '--';
      document.getElementById('dashNextMedTime').textContent = 'Sin medicamentos';
    }
  } else {
    document.getElementById('dashNextMed').textContent = '--';
    document.getElementById('dashNextMedTime').textContent = 'Sin medicamentos';
  }

  allGlucose.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  drawGlucoseChart(allGlucose);
}

// ===== CONFIG =====
async function loadConfig() {
  document.getElementById('configName').value = await dbLocalGetConfig('name') || 'Pepe';
  document.getElementById('configWhatsApp').value = await dbLocalGetConfig('whatsapp') || '';
  document.getElementById('configGlucoseReminder').value = await dbLocalGetConfig('glucoseReminder') || '1440';
}

async function saveConfig() {
  const name = document.getElementById('configName').value.trim();
  const wa = document.getElementById('configWhatsApp').value.trim();
  const reminder = document.getElementById('configGlucoseReminder').value;
  if (name) await dbLocalSetConfig('name', name);
  if (wa) await dbLocalSetConfig('whatsapp', wa);
  await dbLocalSetConfig('glucoseReminder', reminder);
  showToast('✅ Configuración guardada');
}

// ===== RECORDATORIOS =====
async function checkReminders() {
  const meds = await getAllData('medications');
  const currentTime = nowTime();

  for (const m of meds) {
    for (const t of (m.times || [])) {
      if (t === currentTime) {
        const key = 'notified_' + m.id + '_' + t;
        const lastNotified = await dbLocalGetConfig(key);
        if (lastNotified !== today()) {
          await dbLocalSetConfig(key, today());
          showToast('🔔 ¡Hora de tomar ' + m.name + '! (' + m.dosage + ' ' + m.unit + ')');
          if (m.wa && m.wa.length >= 8) {
            setTimeout(() => {
              if (confirm('🔔 ¿Enviar recordatorio a WhatsApp para ' + m.name + '?')) {
                sendWhatsApp(m.name, m.dosage + ' ' + m.unit, t, m.wa);
              }
            }, 2000);
          }
        }
      }
    }
  }
}

// ===== EXPORT / CLEAR =====
async function exportData() {
  try {
    const data = { exportDate: new Date().toISOString(), glucose: await getAllData('glucose'), medications: await getAllData('medications'), vitals: await getAllData('vitals') };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SaludPepe_datos_' + today() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('📤 Datos exportados');
  } catch (e) { showToast('❌ Error al exportar'); }
}

async function clearAllData() {
  try {
    await dbLocalClear('glucose');
    await dbLocalClear('medications');
    await dbLocalClear('vitals');
    showToast('🗑️ Datos borrados');
    updateDashboard();
    updateGlucoseHistory();
    renderMeds();
    updateVitalsHistory();
  } catch (e) { showToast('❌ Error al borrar datos'); }
}
