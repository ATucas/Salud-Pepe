/* ========================================
   SALUD PEPE - App de control de salud
   ======================================== */

// ===== BASE DE DATOS (IndexedDB) =====
const DB_NAME = 'SaludPepeDB';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('glucose')) {
        const store = db.createObjectStore('glucose', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('medications')) {
        const store = db.createObjectStore('medications', { keyPath: 'id', autoIncrement: true });
        store.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('vitals')) {
        const store = db.createObjectStore('vitals', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbAdd(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.add(data);
    req.onsuccess = () => { tx.commit(); resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const idx = store.index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => { tx.commit(); resolve(); };
    req.onerror = () => reject(req.error);
  });
}

async function dbClear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => { tx.commit(); resolve(); };
    req.onerror = () => reject(req.error);
  });
}

async function dbGetConfig(key) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('config', 'readonly');
    const store = tx.objectStore('config');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => resolve(null);
  });
}

async function dbSetConfig(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('config', 'readwrite');
    const store = tx.objectStore('config');
    const req = store.put({ key, value });
    req.onsuccess = () => { tx.commit(); resolve(); };
    req.onerror = () => reject(req.error);
  });
}

// ===== UTILIDADES =====
function today() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function nowTime() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

function nowISO() {
  return new Date().toISOString();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(iso) {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

function diaSemana() {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const d = new Date();
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} del ${d.getFullYear()}`;
}

// ===== TOAST =====
let toastTimer = null;
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
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');
  const navBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');

  const titles = { dashboard: 'Resumen', glucose: 'Glucosa', meds: 'Medicamentos', vitals: 'Vitales', config: 'Configuración' };
  const icons = { dashboard: '📊', glucose: '🩸', meds: '💊', vitals: '🌡️', config: '⚙️' };
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
let glucoseChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Set date/time defaults
  const todayStr = today();
  document.getElementById('glucoseDate').value = todayStr;
  document.getElementById('glucoseTime').value = nowTime();
  document.getElementById('vitalsDate').value = todayStr;
  document.getElementById('vitalsTime').value = nowTime();

  // Glucose quick buttons
  document.querySelectorAll('.quick-glucose').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.quick-glucose').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('glucoseValue').value = btn.dataset.value;
      updateGlucoseStatus(parseInt(btn.dataset.value));
    });
  });

  // Glucose value live status
  document.getElementById('glucoseValue').addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    if (v) updateGlucoseStatus(v);
    else document.getElementById('glucoseStatus').style.display = 'none';
  });

  // Vitals quick buttons
  document.querySelectorAll('.quick-vital').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.parentElement;
      group.querySelectorAll('.quick-vital').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (btn.dataset.temp) document.getElementById('tempValue').value = btn.dataset.temp;
      if (btn.dataset.oxygen) document.getElementById('oxygenValue').value = btn.dataset.oxygen;
    });
  });

  // Save glucose
  document.getElementById('saveGlucose').addEventListener('click', saveGlucose);

  // Save med
  document.getElementById('saveMed').addEventListener('click', saveMedication);

  // Save vitals
  document.getElementById('saveVitals').addEventListener('click', saveVitals);

  // Hide splash
  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    updateDashboard();
    checkReminders();
    setInterval(checkReminders, 60000);
  }, 1200);
});

// ===== GLUCOSA =====
function updateGlucoseStatus(value) {
  const el = document.getElementById('glucoseStatus');
  if (value < 70) {
    el.className = 'glucose-status danger';
    el.textContent = '⚠️ ¡Hipoglucemia! Nivel bajo. Consulta a tu médico.';
    el.style.display = 'block';
  } else if (value >= 70 && value <= 140) {
    el.className = 'glucose-status success';
    el.textContent = '✅ Nivel normal. ¡Sigue así!';
    el.style.display = 'block';
  } else if (value > 140 && value <= 180) {
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

  const record = {
    value,
    date,
    time,
    notes,
    timestamp: `${date}T${time}:00`
  };

  try {
    await dbAdd('glucose', record);
    showToast('✅ Glucosa registrada correctamente');
    document.getElementById('glucoseValue').value = '';
    document.getElementById('glucoseNotes').value = '';
    document.getElementById('glucoseStatus').style.display = 'none';
    document.querySelectorAll('.quick-glucose').forEach(b => b.classList.remove('selected'));
    updateGlucoseHistory();
    updateDashboard();
  } catch (e) {
    showToast('❌ Error al guardar');
    console.error(e);
  }
}

async function updateGlucoseHistory() {
  const all = await dbGetAll('glucose');
  all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const todayRecords = all.filter(r => r.date === today());
  const todayEl = document.getElementById('glucoseTodayList');
  const allEl = document.getElementById('glucoseAllList');

  if (todayRecords.length === 0) {
    todayEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🩸</div><p>No hay registros de glucosa hoy</p></div>';
  } else {
    todayEl.innerHTML = todayRecords.map(r =>
      `<div class="history-item">
        <div class="item-main">
          <span class="item-value">${r.value} mg/dL</span>
          <span class="item-meta">${r.time}${r.notes ? ' · ' + r.notes : ''}</span>
        </div>
        <span style="font-size:1.2rem">${glucoseEmoji(r.value)}</span>
      </div>`
    ).join('');
  }

  if (all.length === 0) {
    allEl.innerHTML = '<div class="empty-state"><p>Sin registros aún</p></div>';
  } else {
    allEl.innerHTML = all.map(r =>
      `<div class="history-item">
        <div class="item-main">
          <span class="item-value">${r.value} mg/dL</span>
          <span class="item-meta">${formatDate(r.timestamp)} ${r.time}${r.notes ? ' · ' + r.notes : ''}</span>
        </div>
        <span style="font-size:1.2rem">${glucoseEmoji(r.value)}</span>
      </div>`
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

// ===== GRÁFICO DE GLUCOSA =====
async function drawGlucoseChart(allData) {
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
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    // Return the average for daily trend
    const sum = vals.reduce((a, b) => a + b, 0);
    return { date, avg: Math.round(sum / vals.length), min, max, count: vals.length };
  });

  const hasData = points.some(p => p !== null);

  if (!hasData) {
    canvas.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  canvas.style.display = 'block';
  emptyEl.style.display = 'none';

  const w = canvas.width;
  const h = canvas.height;
  const pad = { top: 20, bottom: 30, left: 40, right: 20 };

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#FAFBFA';
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (h - pad.top - pad.bottom) * (1 - i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(50 + i * 70, pad.left - 5, y + 3);
  }

  // Normal range highlight (70-140)
  const yMin = pad.top + (h - pad.top - pad.bottom) * (1 - (70 - 50) / (330 - 50));
  const yMax = pad.top + (h - pad.top - pad.bottom) * (1 - (140 - 50) / (330 - 50));
  ctx.fillStyle = 'rgba(42, 157, 143, 0.1)';
  ctx.fillRect(pad.left, yMax, w - pad.left - pad.right, yMin - yMax);

  // Normal range labels
  ctx.fillStyle = 'rgba(42, 157, 143, 0.4)';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('─ Normal', w - pad.right - 60, yMin - 2);
  ctx.fillText('─ Normal', w - pad.right - 60, yMax + 12);

  // Plot
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const validPoints = points.map((p, i) => {
    if (!p) return null;
    return {
      x: pad.left + (i / (points.length - 1)) * plotW,
      y: pad.top + (1 - (p.avg - 50) / (330 - 50)) * plotH,
      ...p
    };
  });

  const vp = validPoints.filter(p => p !== null);
  if (vp.length === 0) return;

  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = '#E76F51';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  let started = false;
  validPoints.forEach((p, i) => {
    if (!p) { started = false; return; }
    if (!started) { ctx.moveTo(p.x, p.y); started = true; }
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Draw dots and labels
  validPoints.forEach((p) => {
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#E76F51';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Day label
    ctx.fillStyle = '#6B7280';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dayIdx = new Date(p.date).getDay();
    ctx.fillText(dayNames[dayIdx], p.x, h - 8);

    // Value label
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
  row.innerHTML = `
    <input type="time" class="med-time" value="${value || '12:00'}">
    <button class="remove-time" onclick="removeTime(this)">✕</button>
  `;
  container.appendChild(row);
}

function removeTime(btn) {
  const container = document.getElementById('medTimes');
  if (container.children.length <= 1) {
    showToast('❌ Debe haber al menos un horario');
    return;
  }
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

  try {
    await dbAdd('medications', med);
    showToast('💊 Medicamento guardado');
    document.getElementById('medName').value = '';
    document.getElementById('medDosage').value = '';
    document.getElementById('medNotes').value = '';
    renderMeds();
    updateDashboard();
  } catch (e) {
    showToast('❌ Error al guardar');
  }
}

async function renderMeds() {
  const list = document.getElementById('medList');
  const meds = await dbGetAll('medications');

  if (meds.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">💊</div><p>No hay medicamentos registrados</p><p style="font-size:0.8rem;margin-top:0.3rem">Agrega tus medicamentos arriba</p></div>';
    return;
  }

  // Sort by earliest time today
  meds.sort((a, b) => {
    const aTime = a.times[0] || '00:00';
    const bTime = b.times[0] || '00:00';
    return aTime.localeCompare(bTime);
  });

  list.innerHTML = meds.map(m => {
    const dosesToday = m.notes || '';
    return `<div class="med-card">
      <div class="med-card-header">
        <div>
          <div class="med-card-name">💊 ${m.name}</div>
          <div class="med-card-dosage">${m.dosage} ${m.unit}${dosesToday ? ' · ' + dosesToday : ''}</div>
        </div>
        <button class="btn-delete" onclick="deleteMed(${m.id})" style="padding:0.3rem 0.6rem;font-size:0.75rem;width:auto;flex:none">🗑️</button>
      </div>
      <div class="med-card-times">
        ${m.times.map(t => {
          const isNext = isNextDose(m.times, t);
          return `<span class="med-card-time" style="${isNext ? 'background:var(--primary);color:white' : ''}">🕐 ${t}${isNext ? ' ⬅️' : ''}</span>`;
        }).join('')}
      </div>
      <div class="med-card-actions">
        <button class="btn-remind" onclick="sendWhatsApp('${m.name}', '${m.dosage} ${m.unit}', '${m.times.join(', ')}', '${m.wa}')">📲 Recordar por WhatsApp</button>
      </div>
    </div>`;
  }).join('');
}

function isNextDose(times, time) {
  const now = nowTime();
  const upcoming = times.filter(t => t > now).sort();
  if (upcoming.length === 0) return false;
  return time === upcoming[0];
}

async function deleteMed(id) {
  if (!confirm('¿Eliminar este medicamento?')) return;
  try {
    await dbDelete('medications', id);
    renderMeds();
    updateDashboard();
    showToast('🗑️ Medicamento eliminado');
  } catch (e) {
    showToast('❌ Error al eliminar');
  }
}

function sendWhatsApp(name, dosage, times, waNumber) {
  if (!waNumber || waNumber.length < 8) {
    showToast('❌ Configura un número de WhatsApp en el medicamento');
    return;
  }

  const clean = waNumber.replace(/[^0-9]/g, '');
  const msg = encodeURIComponent(
    `🔔 *Recordatorio Salud Pepe*\n\n💊 *${name}*\nDosis: ${dosage}\nHorarios: ${times}\n\n¡No olvides tomar tu medicamento! 🙏`
  );

  const url = `https://wa.me/${clean}?text=${msg}`;
  window.open(url, '_blank');
}

// ===== VITALES =====
async function saveVitals() {
  const temp = parseFloat(document.getElementById('tempValue').value);
  const oxygen = parseInt(document.getElementById('oxygenValue').value);
  const date = document.getElementById('vitalsDate').value;
  const time = document.getElementById('vitalsTime').value;

  if (!temp && !oxygen) {
    showToast('❌ Ingresa al menos temperatura o SpO₂');
    return;
  }

  const record = {
    temperature: temp || null,
    oxygen: oxygen || null,
    date,
    time,
    timestamp: `${date}T${time}:00`
  };

  try {
    await dbAdd('vitals', record);
    showToast('✅ Registro guardado');
    document.getElementById('tempValue').value = '';
    document.getElementById('oxygenValue').value = '';
    document.querySelectorAll('.quick-vital').forEach(b => b.classList.remove('selected'));
    updateVitalsHistory();
    updateDashboard();
  } catch (e) {
    showToast('❌ Error al guardar');
  }
}

async function updateVitalsHistory() {
  const all = await dbGetAll('vitals');
  all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const todayRecords = all.filter(r => r.date === today());
  const todayEl = document.getElementById('vitalsTodayList');
  const allEl = document.getElementById('vitalsAllList');

  if (todayRecords.length === 0) {
    todayEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🌡️</div><p>No hay registros hoy</p></div>';
  } else {
    todayEl.innerHTML = todayRecords.map(r => {
      const parts = [];
      if (r.temperature) parts.push(`🌡️ ${r.temperature}°C`);
      if (r.oxygen) parts.push(`🫁 ${r.oxygen}%`);
      return `<div class="history-item">
        <div class="item-main">
          <span class="item-value">${parts.join(' | ')}</span>
          <span class="item-meta">${r.time}</span>
        </div>
      </div>`;
    }).join('');
  }

  if (all.length === 0) {
    allEl.innerHTML = '<div class="empty-state"><p>Sin registros aún</p></div>';
  } else {
    allEl.innerHTML = all.map(r => {
      const parts = [];
      if (r.temperature) parts.push(`🌡️ ${r.temperature}°C`);
      if (r.oxygen) parts.push(`🫁 ${r.oxygen}%`);
      return `<div class="history-item">
        <div class="item-main">
          <span class="item-value">${parts.join(' | ')}</span>
          <span class="item-meta">${formatDate(r.timestamp)} ${r.time}</span>
        </div>
      </div>`;
    }).join('');
  }
}

// ===== DASHBOARD =====
async function updateDashboard() {
  // Date
  document.getElementById('todayDate').textContent = diaSemana();

  const allGlucose = await dbGetAll('glucose');
  const allVitals = await dbGetAll('vitals');
  const allMeds = await dbGetAll('medications');

  const todayGlucose = allGlucose.filter(r => r.date === today());
  const todayVitals = allVitals.filter(r => r.date === today());

  // Glucose summary
  if (todayGlucose.length > 0) {
    const last = todayGlucose[todayGlucose.length - 1];
    document.getElementById('dashGlucose').textContent = `${last.value} mg/dL`;
    document.getElementById('dashGlucoseTime').textContent = `Último: ${last.time}`;
    // Trend emoji
    if (todayGlucose.length >= 2) {
      const prev = todayGlucose[todayGlucose.length - 2];
      if (last.value > prev.value) document.getElementById('dashGlucoseTrend').textContent = '📈';
      else if (last.value < prev.value) document.getElementById('dashGlucoseTrend').textContent = '📉';
      else document.getElementById('dashGlucoseTrend').textContent = '➡️';
    } else {
      document.getElementById('dashGlucoseTrend').textContent = '📌';
    }
  } else {
    document.getElementById('dashGlucose').textContent = '-- mg/dL';
    document.getElementById('dashGlucoseTime').textContent = 'Sin registro hoy';
    document.getElementById('dashGlucoseTrend').textContent = '';
  }

  // Temperature
  const lastTemp = todayVitals.filter(r => r.temperature).pop();
  if (lastTemp) {
    document.getElementById('dashTemp').textContent = `${lastTemp.temperature} °C`;
    document.getElementById('dashTempTime').textContent = `Último: ${lastTemp.time}`;
  } else {
    document.getElementById('dashTemp').textContent = '-- °C';
    document.getElementById('dashTempTime').textContent = 'Sin registro hoy';
  }

  // Oxygen
  const lastOxy = todayVitals.filter(r => r.oxygen).pop();
  if (lastOxy) {
    document.getElementById('dashOxygen').textContent = `${lastOxy.oxygen} %`;
    document.getElementById('dashOxygenTime').textContent = `Último: ${lastOxy.time}`;
  } else {
    document.getElementById('dashOxygen').textContent = '-- %';
    document.getElementById('dashOxygenTime').textContent = 'Sin registro hoy';
  }

  // Next medication
  const now = nowTime();
  let nextMed = null;
  let nextTime = null;

  for (const m of allMeds) {
    for (const t of m.times) {
      if (t > now) {
        if (!nextTime || t < nextTime) {
          nextTime = t;
          nextMed = m;
        }
      }
    }
  }

  if (nextMed) {
    document.getElementById('dashNextMed').textContent = `💊 ${nextMed.name}`;
    document.getElementById('dashNextMedTime').textContent = `⏰ ${nextMed.dosage} ${nextMed.unit} a las ${nextTime}`;
  } else {
    const tomorrow = allMeds.flatMap(m => m.times.map(t => ({ med: m, time: t })));
    if (tomorrow.length > 0) {
      const first = tomorrow.sort((a, b) => a.time.localeCompare(b.time))[0];
      document.getElementById('dashNextMed').textContent = `💊 ${first.med.name}`;
      document.getElementById('dashNextMedTime').textContent = `Mañana ${first.med.dosage} ${first.med.unit} a las ${first.time}`;
    } else {
      document.getElementById('dashNextMed').textContent = '--';
      document.getElementById('dashNextMedTime').textContent = 'Sin medicamentos';
    }
  }

  // Draw chart
  allGlucose.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  drawGlucoseChart(allGlucose);
}

// ===== CONFIGURACIÓN =====
async function loadConfig() {
  const name = await dbGetConfig('name');
  const wa = await dbGetConfig('whatsapp');
  const reminder = await dbGetConfig('glucoseReminder');

  if (name) document.getElementById('configName').value = name;
  if (wa) document.getElementById('configWhatsApp').value = wa;
  if (reminder) document.getElementById('configGlucoseReminder').value = reminder;
}

async function saveConfig() {
  const name = document.getElementById('configName').value.trim();
  const wa = document.getElementById('configWhatsApp').value.trim();
  const reminder = document.getElementById('configGlucoseReminder').value;

  if (name) await dbSetConfig('name', name);
  if (wa) await dbSetConfig('whatsapp', wa);
  await dbSetConfig('glucoseReminder', reminder);

  showToast('✅ Configuración guardada');
}

// ===== RECORDATORIOS =====
async function checkReminders() {
  // This runs every minute and checks if any medication is due within the next minute
  const meds = await dbGetAll('medications');
  const now = new Date();
  const currentTime = nowTime();

  for (const m of meds) {
    for (const t of m.times) {
      if (t === currentTime) {
        // Check if we already notified (store last notified times)
        const key = `notified_${m.id}_${t}`;
        const lastNotified = await dbGetConfig(key);
        if (!lastNotified || lastNotified !== today()) {
          await dbSetConfig(key, today());
          // Show in-app notification
          showToast(`🔔 ¡Hora de tomar ${m.name}! (${m.dosage} ${m.unit})`);

          // If has WhatsApp number, offer to send
          if (m.wa && m.wa.length >= 8) {
            setTimeout(() => {
              if (confirm(`🔔 ¿Enviar recordatorio a WhatsApp para ${m.name}?`)) {
                sendWhatsApp(m.name, `${m.dosage} ${m.unit}`, t, m.wa);
              }
            }, 2000);
          }
        }
      }
    }
  }
}

// ===== EXPORTACIÓN DE DATOS =====
async function exportData() {
  try {
    const glucose = await dbGetAll('glucose');
    const meds = await dbGetAll('medications');
    const vitals = await dbGetAll('vitals');

    const data = {
      exportDate: nowISO(),
      glucose,
      medications: meds,
      vitals
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SaludPepe_datos_${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📤 Datos exportados');
  } catch (e) {
    showToast('❌ Error al exportar');
  }
}

async function clearAllData() {
  try {
    await dbClear('glucose');
    await dbClear('medications');
    await dbClear('vitals');
    // Don't clear config
    showToast('🗑️ Datos borrados');
    updateDashboard();
    updateGlucoseHistory();
    renderMeds();
    updateVitalsHistory();
  } catch (e) {
    showToast('❌ Error al borrar datos');
  }
}
