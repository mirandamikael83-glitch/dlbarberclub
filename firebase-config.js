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
      if (typeof renderAdminDashboard === 'function') renderAdminDashboard();
    }
    /* Re-renderiza horários se usuário estiver no passo 4 do agendamento */
    if (typeof bk !== 'undefined' && bk && bk.barber && bk.date && bk.step === 4) {
      if (typeof renderTimeSlots === 'function') renderTimeSlots();
    }
  }, err => console.warn('[Firebase] Listener agendamentos:', err.message));

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

  /* Assinantes */
  db.ref('subscribers').on('value', snap => {
    const val = snap.val();
    if (typeof SUBSCRIBERS !== 'undefined') {
      SUBSCRIBERS = val
        ? (Array.isArray(val) ? val : Object.values(val))
        : [];
    }
  }, err => console.warn('[Firebase] Listener assinantes:', err.message));

  console.info('[Firebase] Listeners em tempo real ativos ✓');
}
