import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, getRedirectResult, signInWithCredential, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendEmailVerification, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, where, writeBatch, setDoc, getDoc, getDocs, runTransaction, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// Test Firebase project. Client configuration is public; access is protected by Authentication and Firestore rules.
const firebaseConfig = {
  apiKey: "AIzaSyAXUN_8dzwaaDaRALpS-rRzGqj2kKYUb40",
  authDomain: "grocery-list-pksmn-test.firebaseapp.com",
  projectId: "grocery-list-pksmn-test",
  storageBucket: "grocery-list-pksmn-test.firebasestorage.app",
  messagingSenderId: "530437162373",
  appId: "1:530437162373:web:00b19182ec6075a8c9f0ec"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const DEFAULT_STORES = ['No Frills', 'Costco', 'Walmart', 'Farm Boy', 'Other'];
const $ = id => document.getElementById(id);
let user = null, familyId = null, family = null, stores = [...DEFAULT_STORES], items = [];
let stopItems = null, stopFamily = null, stopMembers = null, stopInvites = null, stopSettings = null;
let members = [], invites = [], busy = false, savedStores = [...DEFAULT_STORES];

function message(target, text, error = false) {
  const el = $(target); if (!el) return;
  el.textContent = text; el.classList.toggle('error', error);
}
function cleanEmail(value) { return String(value || '').trim().toLowerCase(); }
function requireVerifiedUser() {
  if (!user) throw new Error('Please sign in first.');
  if (!user.emailVerified) throw new Error('Please verify your email address, then sign in again.');
}
function friendly(error) {
  const code = error?.code || '';
  if (code === 'permission-denied') return 'Permission denied. Check that the current Firestore rules have been published.';
  if (code === 'auth/email-already-in-use') return 'That email already has an account. Please sign in instead.';
  if (code === 'auth/invalid-credential') return 'Email or password is incorrect.';
  if (code === 'auth/weak-password') return 'Choose a password with at least 6 characters.';
  if (code === 'auth/unauthorized-domain') return 'This app domain is not authorized in Firebase Authentication.';
  if (code === 'auth/popup-blocked') return 'The sign-in popup was blocked. Allow pop-ups and try again.';
  if (code === 'failed-precondition') return 'The operation could not be completed. Please refresh and try again.';
  return error?.message || 'Something went wrong. Please try again.';
}
function showPage(page) {
  ['family','invites','list','stores'].forEach(name => {
    const section = $('page-' + name);
    if (section) section.classList.toggle('active', name === page);
    const button = document.querySelector('#pageNav [data-page="' + name + '"]');
    if (button) {
      button.classList.toggle('active', name === page);
      button.setAttribute('aria-current', name === page ? 'page' : 'false');
    }
  });
}
document.querySelectorAll('#pageNav [data-page]').forEach(button => {
  button.addEventListener('click', () => showPage(button.dataset.page));
});
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function stopFamilyListeners() {
  [stopItems, stopFamily, stopMembers, stopInvites, stopSettings].forEach(fn => { if (fn) fn(); });
  stopItems = stopFamily = stopMembers = stopInvites = stopSettings = null;
}
function familyPath(...parts) { return ['families', familyId, ...parts]; }
function familyRef() { return doc(db, ...familyPath()); }
function memberRef(uid = user.uid) { return doc(db, ...familyPath('members', uid)); }
function itemsRef() { return collection(db, ...familyPath('items')); }
function settingsRef() { return doc(db, ...familyPath('settings', 'stores')); }

function refreshStoreList() {
  const itemStores = [...new Set(items.map(x => typeof x.store === 'string' ? x.store.trim() : '').filter(Boolean))];
  const nextStores = [...new Set([...savedStores, ...DEFAULT_STORES, ...itemStores])];
  const changed = JSON.stringify(nextStores) !== JSON.stringify(savedStores);
  stores = nextStores;
  if (changed) {
    savedStores = [...nextStores];
    setDoc(settingsRef(), {stores: nextStores, updatedAt: Date.now()})
      .catch(e => message('appStatus', friendly(e), true));
  }
}

function renderStores() {
  const select = $('storeSelect'), selected = select.value;
  select.replaceChildren();
  stores.forEach(name => { const opt = document.createElement('option'); opt.value = name; opt.textContent = name; select.append(opt); });
  select.value = stores.includes(selected) ? selected : (stores[0] || 'Other');
  const list = $('storeManager'); list.replaceChildren();
  stores.forEach((name, index) => {
    const row = document.createElement('div'); row.className = 'store-row';
    const label = document.createElement('span'); label.textContent = name; row.append(label);
    const rename = document.createElement('button'); rename.className = 'secondary'; rename.textContent = 'Rename';
    rename.onclick = async () => {
      const next = prompt('Rename "' + name + '" to:', name)?.trim();
      if (!next || next === name) return;
      if (stores.some((s, i) => i !== index && s.toLowerCase() === next.toLowerCase())) return alert('That store already exists.');
      try {
        const batch = writeBatch(db);
        items.filter(x => x.store === name).forEach(x => batch.update(doc(db, ...familyPath('items', x.id)), {store: next, updatedAt: Date.now()}));
        const nextStores = stores.map(s => s === name ? next : s);
        batch.set(settingsRef(), {stores: nextStores, updatedAt: Date.now()});
        await batch.commit();
      } catch (e) { message('appStatus', friendly(e), true); }
    };
    row.append(rename);
    if (name !== 'Other' && stores.length > 1) {
      const remove = document.createElement('button'); remove.className = 'secondary danger'; remove.textContent = 'Remove';
      remove.onclick = async () => {
        if (!confirm('Remove "' + name + '"? Existing items will move to Other.')) return;
        try {
          const batch = writeBatch(db);
          items.filter(x => x.store === name).forEach(x => batch.update(doc(db, ...familyPath('items', x.id)), {store: 'Other', updatedAt: Date.now()}));
          batch.set(settingsRef(), {stores: stores.filter(s => s !== name), updatedAt: Date.now()});
          await batch.commit();
        } catch (e) { message('appStatus', friendly(e), true); }
      };
      row.append(remove);
    }
    list.append(row);
  });
}
function renderItems() {
  renderStores();
  const root = $('groups'); root.replaceChildren();
  let open = 0, done = 0;
  stores.forEach(store => {
    const list = items.filter(x => x.store === store).sort((a,b) => Number(a.done)-Number(b.done) || (a.done ? (b.doneAt||0)-(a.doneAt||0) : (a.createdAt||0)-(b.createdAt||0)));
    if (!list.length) return;
    const section = document.createElement('section'); section.className = 'store';
    const h = document.createElement('h2'); h.textContent = store; section.append(h);
    const ul = document.createElement('ul');
    list.forEach(item => {
      item.done ? done++ : open++;
      const li = document.createElement('li'); if (item.done) li.className = 'done';
      const toggle = document.createElement('button'); toggle.className = 'item-toggle'; toggle.type = 'button';
      const check = document.createElement('span'); check.className = 'check';
      const label = document.createElement('span'); label.className = 'item-text'; label.textContent = item.text;
      toggle.append(check, label); toggle.setAttribute('aria-pressed', String(!!item.done));
      toggle.onclick = async () => { try { await updateDoc(doc(db, ...familyPath('items', item.id)), {done: !item.done, doneAt: !item.done ? Date.now() : 0, updatedAt: Date.now()}); } catch(e) { message('appStatus', friendly(e), true); } };
      const remove = document.createElement('button'); remove.className = 'remove'; remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove ' + item.text);
      remove.onclick = async () => { try { await deleteDoc(doc(db, ...familyPath('items', item.id))); } catch(e) { message('appStatus', friendly(e), true); } };
      li.append(toggle, remove); ul.append(li);
    });
    section.append(ul); root.append(section);
  });
  $('empty').hidden = items.length !== 0;
  $('count').textContent = items.length ? open + ' to get' + (done ? ' · ' + done + ' checked' : '') : '';
  $('clearChecked').hidden = done === 0;
}
function renderMembers() {
  const el = $('memberList'); el.replaceChildren();
  members.forEach(m => { const row = document.createElement('p'); row.className = 'member-row'; row.textContent = (m.email || m.uid) + (m.role === 'owner' ? ' · Owner' : ''); el.append(row); });
  const inv = $('inviteList'); inv.replaceChildren();
  invites.filter(x => x.status === 'pending').forEach(x => {
    const row = document.createElement('div'); row.className='member-row';
    const label = document.createElement('span'); label.style.flex='1'; label.textContent = x.email + ' · Pending';
    const cancel = document.createElement('button'); cancel.className='secondary danger'; cancel.type='button'; cancel.textContent='Cancel';
    cancel.onclick = async () => {
      if (!confirm('Cancel the pending invitation for ' + x.email + '? They will no longer be able to use that link.')) return;
      cancel.disabled = true;
      try {
        await deleteDoc(doc(db, ...familyPath('invites', x.id)));
        message('inviteStatus', 'Invitation for ' + x.email + ' cancelled.');
      } catch (e) {
        cancel.disabled = false;
        message('inviteStatus', friendly(e), true);
      }
    };
    row.append(label, cancel); inv.append(row);
  });
  const isOwner = family?.ownerUid === user?.uid;
  $('invitePanel').classList.toggle('hidden', !isOwner);
  $('inviteUnavailable').classList.toggle('hidden', isOwner);
}
function listenToFamily() {
  stopFamilyListeners();
  if (!familyId) return;
  // Remember the last family the user successfully opened.
  localStorage.setItem('preferredFamilyId', familyId);
  stopFamily = onSnapshot(familyRef(), snap => {
    family = snap.exists() ? {id:snap.id,...snap.data()} : null;
    $('familyName').textContent = family?.name || 'Family';
    // Pending invitations contain private email addresses, so only the owner loads them.
    if (family?.ownerUid === user?.uid) {
      if (!stopInvites) {
        stopInvites = onSnapshot(collection(db, ...familyPath('invites')), inviteSnap => {
          invites = inviteSnap.docs.map(d=>({id:d.id,...d.data()}));
          renderMembers();
        }, e => message('appStatus', friendly(e), true));
      }
    } else {
      if (stopInvites) { stopInvites(); stopInvites = null; }
      invites = [];
    }
    renderMembers();
  }, e => message('appStatus', friendly(e), true));
  stopSettings = onSnapshot(settingsRef(), snap => {
    const data = snap.exists() ? snap.data() : {};
    savedStores = Array.isArray(data.stores) ? data.stores.filter(x => typeof x === 'string' && x.trim()) : [...DEFAULT_STORES];
    refreshStoreList();
    renderItems();
  }, e => message('appStatus', friendly(e), true));
  stopItems = onSnapshot(query(itemsRef()), snap => {
    items = snap.docs.map(d => ({id:d.id,...d.data()})).filter(x => typeof x.text === 'string');
    refreshStoreList();
    renderItems(); message('appStatus', 'Synced · this family’s list is private.');
  }, e => message('appStatus', friendly(e), true));
  stopMembers = onSnapshot(collection(db, ...familyPath('members')), snap => { members = snap.docs.map(d=>({uid:d.id,...d.data()})); renderMembers(); });
  show('appPanel'); hide('familyPanel'); hide('loginPanel'); showPage('list');
}
async function chooseFamily() {
  requireVerifiedUser();
  const memberships = await getDocs(collection(db, 'users', user.uid, 'families'));
  if (memberships.empty) { stopFamilyListeners(); familyId = null; hide('appPanel'); show('familyPanel'); return; }
  const records = await Promise.all(memberships.docs.map(async d => {
    const snap = await getDoc(doc(db, 'families', d.id));
    return snap.exists() ? {id:d.id,...snap.data()} : null;
  }));
  const valid = records.filter(Boolean);
  // Reopen the last family selected by this signed-in user, as long as membership still exists.
  const preferredId = localStorage.getItem('preferredFamilyId');
  const preferred = valid.find(f => f.id === preferredId);
  if (preferred) { familyId = preferred.id; family = preferred; listenToFamily(); return; }
  if (valid.length === 1) { familyId = valid[0].id; family = valid[0]; listenToFamily(); return; }
  if (valid.length > 1) {
    const choice = prompt('Enter the number of the family to open:\n' + valid.map((f,i)=>(i+1)+'. '+f.name).join('\n'));
    const selected = valid[Number(choice)-1];
    if (selected) { familyId = selected.id; family = selected; listenToFamily(); return; }
  }
  hide('appPanel'); show('familyPanel');
}
async function createFamily(name) {
  requireVerifiedUser();
  const clean = name.trim();
  if (!clean) throw new Error('Enter a family name.');
  const newFamily = doc(collection(db, 'families'));
  const batch = writeBatch(db);
  batch.set(newFamily, {name:clean, ownerUid:user.uid, createdAt:Date.now()});
  batch.set(doc(db,'families',newFamily.id,'members',user.uid), {uid:user.uid,email:cleanEmail(user.email),role:'owner',joinedAt:Date.now()});
  batch.set(doc(db,'users',user.uid,'families',newFamily.id), {familyId:newFamily.id,familyName:clean,role:'owner',joinedAt:Date.now()});
  batch.set(doc(db,'families',newFamily.id,'settings','stores'), {stores:DEFAULT_STORES,updatedAt:Date.now()});
  await batch.commit();
  familyId = newFamily.id; family = {id:newFamily.id,name:clean,ownerUid:user.uid}; listenToFamily();
}
function randomToken() {
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
}
async function createInvite(email) {
  requireVerifiedUser();
  if (family?.ownerUid !== user.uid) throw new Error('Only the family owner can invite members.');
  const invitedEmail = cleanEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) throw new Error('Enter a valid email address.');
  if (invitedEmail === cleanEmail(user.email)) throw new Error('You are already the family owner.');
  const token = randomToken();
  await setDoc(doc(db, ...familyPath('invites', token)), {
    email:invitedEmail, familyName:family.name, status:'pending', createdBy:user.uid,
    createdAt:Date.now(), expiresAt:new Date(Date.now() + 7*24*60*60*1000)
  });
  const url = new URL('https://drparveshsharawat-cloud.github.io/Grocery-List-Test/'); url.searchParams.set('invite', token); url.searchParams.set('family', familyId);
  await navigator.clipboard.writeText(url.toString());
  return url.toString();
}
async function redeemInvite(token) {
  requireVerifiedUser();
  const fid = familyIdFromInvite(token);
  const inviteRef = doc(db, 'families', fid, 'invites', token);
  let inviteSnap;
  try {
    inviteSnap = await getDoc(inviteRef);
  } catch (e) {
    if (e?.code === 'permission-denied') throw new Error('Diagnostic: Firestore blocked reading the invitation. The signed-in account or the published invite-read rule is not being accepted.');
    throw e;
  }
  if (!inviteSnap.exists()) throw new Error('This invitation is invalid or has expired.');
  const data = inviteSnap.data();
  if (data.status !== 'pending' || cleanEmail(data.email) !== cleanEmail(user.email) || data.expiresAt.toMillis() < Date.now()) {
    throw new Error('This invitation is not valid for the signed-in email address, or it has expired.');
  }
  const familyName = data.familyName || 'Family';
  const batch = writeBatch(db);
  batch.set(doc(db,'families',fid,'members',user.uid), {uid:user.uid,email:cleanEmail(user.email),role:'member',joinedAt:Date.now(),inviteToken:token});
  batch.set(doc(db,'users',user.uid,'families',fid), {familyId:fid,familyName,role:'member',joinedAt:Date.now()});
  batch.update(inviteRef, {status:'accepted',acceptedBy:user.uid,acceptedAt:Date.now()});
  try {
    await batch.commit();
  } catch (e) {
    if (e?.code === 'permission-denied') throw new Error('Diagnostic: The invitation was read successfully, but Firestore blocked the Join Family batch. This points to a membership, invite-update, or user-family rule.');
    throw e;
  }
  familyId = fid; family = {id:fid,name:familyName}; listenToFamily();
  localStorage.removeItem('pendingFamilyInvite'); localStorage.removeItem('pendingFamilyInviteMeta');
}
function familyIdFromInvite(token) {
  // The token is stored with its family ID after resolving it from the invitation link payload.
  // This helper is replaced by a lookup across the user's invitation landing state.
  const saved = localStorage.getItem('pendingFamilyInviteMeta');
  if (saved) { const parsed = JSON.parse(saved); if (parsed.token === token) return parsed.familyId; }
  throw new Error('Invitation details are missing. Please reopen the full invitation link.');
}
async function handleInviteLanding() {
  const token = new URLSearchParams(location.search).get('invite');
  if (token) {
    localStorage.setItem('pendingFamilyInvite', token);
    // Invite URL includes family ID as a non-secret locator; token remains the authorization secret.
    const fid = new URLSearchParams(location.search).get('family');
    if (fid) localStorage.setItem('pendingFamilyInviteMeta', JSON.stringify({token,familyId:fid}));
    $('joinBox').classList.remove('hidden');
    history.replaceState({}, '', location.pathname);
  }
}
$('googleSignIn').onclick = async () => {
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      const nativeAuth = await import('./native-auth.bundle.js');
      const result = await nativeAuth.signInWithGoogleNative();
      const idToken = result && result.credential && result.credential.idToken;
      const accessToken = result && result.credential && result.credential.accessToken;
      if (!idToken && !accessToken) throw new Error('Google sign-in did not return a credential. Please try again.');
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken, accessToken));
    } else {
      await signInWithPopup(auth, googleProvider);
    }
  } catch(e) { message('authStatus', friendly(e), true); }
};
$('register').onclick = async () => {
  try {
    const credential = await createUserWithEmailAndPassword(auth, cleanEmail($('email').value), $('password').value);
    await sendEmailVerification(credential.user);
    message('authStatus','Account created. Check your email for the verification link, then return and sign in.');
  } catch(e) { message('authStatus', friendly(e), true); }
};
$('emailSignIn').onclick = async () => {
  try { await signInWithEmailAndPassword(auth, cleanEmail($('email').value), $('password').value); }
  catch(e) { message('authStatus', friendly(e), true); }
};
$('resendVerification').onclick = async () => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('Please sign in with the email address and password you used to create the account first.');
    if (user.emailVerified) { message('authStatus','This email address is already verified. Please sign in.'); return; }
    await sendEmailVerification(user);
    message('authStatus','A fresh verification email has been sent. Open the newest email and use its link.');
  } catch(e) { message('authStatus', friendly(e), true); }
};
$('signOut').onclick = async () => {
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      const nativeAuth = await import('./native-auth.bundle.js');
      await nativeAuth.signOutGoogleNative();
    }
    await signOut(auth);
  } catch(e) { message('authStatus', friendly(e), true); }
};
$('createFamily').onclick = async () => { try { await createFamily($('newFamilyName').value); } catch(e) { message('familyStatus', friendly(e), true); } };
$('joinInvite').onclick = async () => {
  try {
    const token = localStorage.getItem('pendingFamilyInvite');
    if (!token) throw new Error('Open the invitation link first.');
    await redeemInvite(token);
  } catch(e) { message('familyStatus', friendly(e), true); }
};
$('addItem').onsubmit = async e => {
  e.preventDefault(); const text = $('newItem').value.trim(); if (!text || busy) return;
  busy = true;
  try {
    await addDoc(itemsRef(), {text,store:stores.includes($('storeSelect').value)?$('storeSelect').value:'Other',done:false,createdAt:Date.now(),doneAt:0,createdBy:user.uid});
    $('newItem').value = ''; $('newItem').focus();
  } catch(e) { message('appStatus', friendly(e), true); }
  finally { busy = false; }
};
$('addStore').onsubmit = async e => {
  e.preventDefault(); const name = $('newStore').value.trim();
  if (!name || stores.some(s=>s.toLowerCase()===name.toLowerCase())) return;
  try { const next=[...stores,name]; await setDoc(settingsRef(),{stores:next,updatedAt:Date.now()}); $('newStore').value=''; }
  catch(e) { message('appStatus',friendly(e),true); }
};
$('clearChecked').onclick = async () => {
  const checked=items.filter(x=>x.done);
  if (!checked.length || !confirm('Delete all '+checked.length+' checked items?')) return;
  try { const batch=writeBatch(db); checked.forEach(x=>batch.delete(doc(db,...familyPath('items',x.id)))); await batch.commit(); }
  catch(e) { message('appStatus',friendly(e),true); }
};
$('createInvite').onclick = async () => {
  try {
    const url = await createInvite($('inviteEmail').value);
    message('inviteStatus','Invitation link copied. Send it only to '+cleanEmail($('inviteEmail').value)+'.');
    $('inviteLink').value=url; show('inviteLink');
  } catch(e) { message('inviteStatus',friendly(e),true); }
};
$('copyInvite').onclick = async () => { try { await navigator.clipboard.writeText($('inviteLink').value); message('inviteStatus','Link copied.'); } catch(e) { message('inviteStatus','Copy the link from the field above.'); } };

try { await getRedirectResult(auth); } catch (e) { message('authStatus', friendly(e), true); }

await handleInviteLanding();
onAuthStateChanged(auth, async nextUser => {
  user = nextUser; stopFamilyListeners(); familyId = null; family = null; items=[]; members=[]; invites=[];
  if (!user) { show('loginPanel'); hide('familyPanel'); hide('appPanel'); return; }
  hide('loginPanel');
  if (!user.emailVerified) {
    show('loginPanel'); message('authStatus','Please verify '+user.email+' using the link we emailed you. Then sign in again.',true); return;
  }
  const token = localStorage.getItem('pendingFamilyInvite');
  if (token) {
    $('joinBox').classList.remove('hidden');
    show('familyPanel'); hide('appPanel');
    $('joinInvite').disabled = false;
    message('familyStatus','Invitation received for '+user.email+'. Join only if this is the email address the invitation was sent to.');
    return;
  }
  try { await chooseFamily(); } catch(e) { show('familyPanel'); message('familyStatus',friendly(e),true); }
});
