'use strict';

/* ═══════════════════════════════════════════════════════════════════
   FIREBASE — REALTIME DATABASE
   SDK carregado via CDN no HTML:
     firebase-app-compat.js
     firebase-database-compat.js
   ═══════════════════════════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey:            "AIzaSyBXFrOyXQ06xtYM00SPaET2kwtibKrv-ec",
  authDomain:        "dlbarberclub-4ad39.firebaseapp.com",
  databaseURL:       "https://dlbarberclub-4ad39-default-rtdb.firebaseio.com",
  projectId:         "dlbarberclub-4ad39",
  storageBucket:     "dlbarberclub-4ad39.firebasestorage.app",
  messagingSenderId: "842776177250",
  appId:             "1:842776177250:web:e4217fe0ac1de013deff3b"
};

/* Inicialização segura — se Firebase falhar, app roda com sessionStorage */
let db = null;
try {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  console.info('[Firebase] Realtime Database conectado ✓');
} catch (err) {
  console.warn('[Firebase] Indisponível — usando sessionStorage como fallback.', err.message);
}

/* ─── FUNÇÕES DE ESCRITA ────────────────────────────────────────── */

function fbSaveAppt(appt) {
  if (!db || !appt || !appt.id) return;
  db.ref('appointments/' + appt.id).set(appt)
    .catch(err => console.warn('[Firebase] Erro ao salvar agendamento:', err.message));
}

function fbDeleteAppt(id) {
  if (!db || !id) return;
  db.ref('appointments/' + id).remove()
    .catch(err => console.warn('[Firebase] Erro ao excluir agendamento:', err.message));
}

function fbUpdateApptStatus(id, status) {
  if (!db || !id) return;
  db.ref('appointments/' + id + '/status').set(status)
    .catch(err => console.warn('[Firebase] Erro ao atualizar status:', err.message));
}

function fbSavePayment(payment) {
  if (!db || !payment || !payment.id) return;
  db.ref('payments/' + payment.id).set(payment)
    .catch(err => console.warn('[Firebase] Erro ao salvar pagamento:', err.message));
}

function fbDeletePayment(id) {
  if (!db || !id) return;
  db.ref('payments/' + id).remove()
    .catch(err => console.warn('[Firebase] Erro ao excluir pagamento:', err.message));
}

function fbSaveSubs(subs) {
  if (!db) return;
  db.ref('subscribers').set(Array.isArray(subs) && subs.length ? subs : null)
    .catch(err => console.warn('[Firebase] Erro ao salvar assinantes:', err.message));
}

/* ─── VERIFICAÇÃO DE HORÁRIO DISPONÍVEL (anti-duplo-agendamento) ── */

async function fbCheckSlotAvailable(barberId, dateKey, time) {
  if (!db) return true; /* sem Firebase, confia no array local */
  try {
    const snap = await db.ref('appointments')
      .orderByChild('barberId')
      .equalTo(barberId)
      .once('value');
    const data = snap.val();
    if (!data) return true;
    return !Object.values(data).some(
      a => a.dateKey === dateKey && a.time === time && a.status !== 'cancelled'
    );
  } catch (err) {
    console.warn('[Firebase] Erro ao verificar disponibilidade:', err.message);
    return true;
  }
}

/* ─── RESERVA ATÔMICA DE HORÁRIO (trava real no banco) ──────────
   Usa uma transaction do Realtime Database sobre um nó dedicado
   (slotLocks). A transaction só "vence a corrida" para UM dos
   dois clientes que tentarem o mesmo horário ao mesmo tempo —
   isso é garantido pelo próprio Firebase (Compare-And-Swap),
   não depende de checagem prévia (que sozinha teria brecha). */

function slotLockRef(barberId, dateKey, time) {
  return db.ref('slotLocks/' + barberId + '/' + dateKey + '/' + time);
}

async function fbReserveSlot(barberId, dateKey, time, apptId) {
  if (!db) return { ok: true, synced: false }; /* sem Firebase, confia no fluxo local (não sincroniza com outros dispositivos) */
  try {
    const result = await slotLockRef(barberId, dateKey, time).transaction(current => {
      if (current) return; /* já ocupado -> aborta a transaction (undefined) */
      return apptId;
    });
    if (!result.committed) {
      return { ok: false, reason: 'Este horário já foi reservado. Escolha outro horário.' };
    }
    return { ok: true, synced: true };
  } catch (err) {
    console.warn('[Firebase] Erro ao reservar horário:', err.message);
    return { ok: true, synced: false }; /* falha de rede: não bloqueia o cliente, mas não há garantia de sincronização */
  }
}

function fbReleaseSlot(barberId, dateKey, time) {
  if (!db) return;
  slotLockRef(barberId, dateKey, time).remove()
    .catch(err => console.warn('[Firebase] Erro ao liberar horário:', err.message));
}

/* ─── CREDENCIAIS DOS BARBEIROS (senha com hash, nunca em texto puro) ── */

function fbSaveBarberCred(barberId, cred) {
  if (!db || !barberId || !cred) return Promise.resolve();
  return db.ref('barberCreds/' + barberId).set(cred)
    .catch(err => console.warn('[Firebase] Erro ao salvar credencial:', err.message));
}

async function fbLoadAllBarberCreds() {
  if (!db) return {};
  try {
    const snap = await db.ref('barberCreds').once('value');
    return snap.val() || {};
  } catch (err) {
    console.warn('[Firebase] Erro ao carregar credenciais:', err.message);
    return {};
  }
}

/* ─── CLIENTES FIXOS (agendamento recorrente semanal) ───────────── */

function fbSaveRecurring(rule) {
  if (!db || !rule || !rule.id) return Promise.resolve();
  return db.ref('recurring/' + rule.id).set(rule)
    .catch(err => console.warn('[Firebase] Erro ao salvar cliente fixo:', err.message));
}

function fbDeleteRecurring(id) {
  if (!db || !id) return Promise.resolve();
  return db.ref('recurring/' + id).remove()
    .catch(err => console.warn('[Firebase] Erro ao excluir cliente fixo:', err.message));
}

/* ─── CHECAGEM DE CONEXÃO REAL (usa o path especial .info/connected) ── */

function fbWaitForConnection(timeoutMs = 4000) {
  return new Promise(resolve => {
    if (!db) { resolve(false); return; }
    let done = false;
    const ref = db.ref('.info/connected');
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      ref.off('value', handler);
      resolve(false);
    }, timeoutMs);
    const handler = snap => {
      if (snap.val() === true && !done) {
        done = true;
        clearTimeout(timer);
        ref.off('value', handler);
        resolve(true);
      }
    };
    ref.on('value', handler);
  });
}

/* ─── FORÇA UMA RELEITURA IMEDIATA (usada pelo auto-refresh de 15s e ao
   voltar de segundo plano no celular, sem depender só do listener .on) ── */

async function fbForceRefreshAppointments() {
  if (!db) return false;
  try {
    const snap = await db.ref('appointments').once('value');
    const val = snap.val();
    if (typeof APPOINTMENTS !== 'undefined') APPOINTMENTS = val ? Object.values(val) : [];
    return true;
  } catch (err) {
    console.warn('[Firebase] Erro no refresh forçado:', err.message);
    return false;
  }
}

/* ─── LISTENERS EM TEMPO REAL ───────────────────────────────────── */

function fbInitListeners() {
  if (!db) {
    console.info('[Firebase] Listeners não iniciados — Firebase indisponível.');
    return;
  }

  /* Agendamentos */
  db.ref('appointments').on('value', snap => {
    const val = snap.val();
    /* Atualiza o array global definido no script principal */
    if (typeof APPOINTMENTS !== 'undefined') {
      APPOINTMENTS = val ? Object.values(val) : [];
    }
    /* Atualiza painel admin se estiver aberto */
    if (typeof currentBarber !== 'undefined' && currentBarber) {
      const activeSec = document.querySelector('#adminPanel .admin-section.active');
      if (activeSec && activeSec.id === 'adm-dashboard' && typeof renderAdminDashboard === 'function') renderAdminDashboard();
      if (activeSec && activeSec.id === 'adm-appointments' && typeof renderAdminApptsOverview === 'function') renderAdminApptsOverview();
    }
    /* Atualiza a agenda privada do barbeiro, se estiver logado */
    if (document.getElementById('barberPanel')?.classList.contains('open') && typeof renderAllAppointments === 'function') {
      renderAllAppointments();
    }
    /* Re-renderiza horários se usuário estiver no passo 4 do agendamento */
    if (typeof bk !== 'undefined' && bk && bk.barber && bk.date && bk.step === 4) {
      if (typeof renderTimeSlots === 'function') renderTimeSlots();
    }
  }, err => console.warn('[Firebase] Listener agendamentos:', err.message));

  /* Clientes fixos (recorrentes) */
  db.ref('recurring').on('value', snap => {
    const val = snap.val();
    if (typeof RECURRING !== 'undefined') {
      RECURRING = val ? Object.values(val) : [];
    }
    if (document.getElementById('barberPanel')?.classList.contains('open') && typeof renderRecurringList === 'function') {
      renderRecurringList();
    }
  }, err => console.warn('[Firebase] Listener clientes fixos:', err.message));

  /* Pagamentos */
  db.ref('payments').on('value', snap => {
    const val = snap.val();
    if (typeof PAYMENTS !== 'undefined') {
      PAYMENTS = val ? Object.values(val) : [];
    }
    if (typeof currentBarber !== 'undefined' && currentBarber) {
      if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
    }
  }, err => console.warn('[Firebase] Listener pagamentos:', err.message));

  /* Histórico do Plano */
  db.ref('planHistory').on('value', snap => {
    const val = snap.val();
    if (typeof PLAN_HISTORY !== 'undefined') {
      PLAN_HISTORY = val ? (Array.isArray(val) ? val : Object.values(val)) : [];
      sessionStorage.setItem('dlbc_plan_history', JSON.stringify(PLAN_HISTORY));
      const subSec = document.getElementById('adm-subscribers');
      if (subSec?.classList.contains('active') && typeof renderSubscribersTab === 'function') renderSubscribersTab();
    }
  }, err => console.warn('[Firebase] Listener histórico plano:', err.message));

  /* Assinantes */
  db.ref('subscribers').on('value', snap => {
    const val = snap.val();
    if (typeof SUBSCRIBERS !== 'undefined') {
      SUBSCRIBERS = val ? (Array.isArray(val) ? val : Object.values(val)) : [];
      if (typeof updateSubBadge === 'function') updateSubBadge();
      const subSec = document.getElementById('adm-subscribers');
      if (subSec?.classList.contains('active') && typeof renderSubscribersTab === 'function') renderSubscribersTab();
    }
  }, err => console.warn('[Firebase] Listener assinantes:', err.message));

  /* Preços dos serviços */
  db.ref('servicePrices').on('value', snap => {
    const prices = snap.val();
    if (!prices || typeof SERVICES === 'undefined') return;
    Object.entries(prices).forEach(([id, price]) => {
      const svc = SERVICES.find(s => s.id === parseInt(id));
      if (svc) svc.price = price;
    });
    if (typeof renderServicesGrid === 'function') renderServicesGrid();
    const pricesSection = document.getElementById('adm-prices');
    if (pricesSection?.classList.contains('active') && typeof renderPricesPanel === 'function') renderPricesPanel();
  }, err => console.warn('[Firebase] Listener preços:', err.message));

  /* Nomes dos serviços */
  db.ref('serviceNames').on('value', snap => {
    const names = snap.val();
    if (!names || typeof SERVICES === 'undefined') return;
    Object.entries(names).forEach(([id, name]) => {
      const svc = SERVICES.find(s => s.id === parseInt(id));
      if (svc) svc.name = name;
    });
    if (typeof renderServicesGrid === 'function') renderServicesGrid();
    const pricesSection = document.getElementById('adm-prices');
    if (pricesSection?.classList.contains('active') && typeof renderPricesPanel === 'function') renderPricesPanel();
  }, err => console.warn('[Firebase] Listener nomes:', err.message));

  console.info('[Firebase] Listeners em tempo real ativos ✓');
}
