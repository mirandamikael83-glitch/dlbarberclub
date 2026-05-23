'use strict';

const firebaseConfig = {
  apiKey: "AIzaSyBXFrOyXQ06xtYM00SPaET2kwtibKrv-ec",
  authDomain: "dlbarberclub-4ad39.firebaseapp.com",
  projectId: "dlbarberclub-4ad39",
  storageBucket: "dlbarberclub-4ad39.firebasestorage.app",
  messagingSenderId: "842776177250",
  appId: "1:842776177250:web:e4217fe0ac1de013deff3b"
};

let db;
try {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  console.log('✅ Firebase ativo');
} catch (e) { console.error('❌', e); }

const COLLECTION = 'bookings';

async function saveBooking(data) {
  if (!db) throw new Error('Firebase não inicializado');
  const check = await db.collection(COLLECTION)
    .where('barberId','==',data.barberId)
    .where('date','==',data.date)
    .where('time','==',data.time)
    .where('status','in',['confirmed','completed']).limit(1).get();
  if (!check.empty) throw new Error('Horário acabou de ser reservado!');
  const ref = await db.collection(COLLECTION).add({
    ...data, status:'confirmed',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

async function getOccupiedTimes(barberId, dateStr) {
  if (!db) return [];
  const snap = await db.collection(COLLECTION)
    .where('barberId','==',barberId)
    .where('date','==',dateStr)
    .where('status','in',['confirmed','completed']).get();
  return snap.docs.map(d => d.data().time);
}

function listenAllBookings(callback) {
  if (!db) return null;
  return db.collection(COLLECTION).orderBy('createdAt','desc').onSnapshot(snap => {
    const arr = [];
    snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
    callback(arr);
  });
}

async function updateBookingStatus(id, status) {
  return await db.collection(COLLECTION).doc(id).update({
    status, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteBooking(id) {
  return await db.collection(COLLECTION).doc(id).delete();
}
