"use strict";

// Accounts: a username and password per person, with that person's "My cards" kept online,
// so it is the same on every phone they sign in on. Built on Google's Firebase:
// - Firebase Authentication checks passwords. It stores them scrambled, never readable,
//   and slows down anyone trying lots of guesses.
// - Firestore stores the cards. firestore.rules decides who may read them.

// Firebase's official web files, fetched only when accounts are switched on.
const FIREBASE_SDK_BASE = "https://www.gstatic.com/firebasejs/12.19.0/";
// Firebase accounts need an email address, but kids often have none. So every username gets
// a made-up address at a domain reserved for examples, where no mail is ever delivered.
// firestore.rules must use the same domain.
const USERNAME_EMAIL_DOMAIN = "kortpris.example.com";
// Firestore: each account's cards are in the document collections/<username>, the cards the app has
// learned for it (learned.js) in learned/<username>, and its settings (the Claude key, see claude.js)
// in settings/<username>. A kid's account names its parent in accounts/<username>, and a parent's
// kids are listed in families/<username> (see firestore.rules for why both).
const CARDS_FOLDER = "collections";
const LEARNED_FOLDER = "learned";
const SETTINGS_FOLDER = "settings";
const ACCOUNT_INFO_FOLDER = "accounts";
const FAMILIES_FOLDER = "families";
// A parent can make this many kids' accounts (firestore.rules says the same).
const MOST_KIDS = 20;
// Lowercase letters a-z, digits, - and _. Letters like æ, ø and å can't be in an email address.
const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;

let firebase = null;   // { auth, db, appModule, authModule, firestoreModule } once started

function accountsAvailable() {
	return FIREBASE_CONFIG !== null || USE_FIREBASE_EMULATOR;
}

// Starts Firebase and calls onAccountChange(username) whenever someone signs in,
// and onAccountChange(null) when nobody is signed in. Firebase remembers who was signed in
// on this phone, so the first call can already have a username.
async function startAccounts(onAccountChange) {
	const [appModule, authModule, firestoreModule] = await Promise.all([
		import(FIREBASE_SDK_BASE + "firebase-app.js"),
		import(FIREBASE_SDK_BASE + "firebase-auth.js"),
		import(FIREBASE_SDK_BASE + "firebase-firestore.js"),
	]);
	const app = appModule.initializeApp(firebaseSettings());
	const auth = authModule.getAuth(app);
	const db = firestoreModule.initializeFirestore(app, { localCache: phoneCopy(firestoreModule) });
	if (USE_FIREBASE_EMULATOR) useEmulator(auth, db, authModule, firestoreModule);
	firebase = { auth, db, appModule, authModule, firestoreModule };
	authModule.onAuthStateChanged(auth, (user) => onAccountChange(user ? usernameOf(user) : null));
}

function firebaseSettings() {
	return USE_FIREBASE_EMULATOR ? EMULATOR_CONFIG : FIREBASE_CONFIG;
}

function useEmulator(auth, db, authModule, firestoreModule) {
	authModule.connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
	firestoreModule.connectFirestoreEmulator(db, "localhost", 8080);
}

// Firestore keeps a copy of the account's cards in the phone's own database (IndexedDB), so they show
// without internet - in the installed app on an iPhone, the only place they are - and changes made
// meanwhile are sent when the phone is online again. Where the phone won't keep one (some private
// browsing), Firestore keeps the copy in memory only, as before.
function phoneCopy(firestoreModule) {
	const { persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } = firestoreModule;
	try {
		// "Multiple tab": the app open in two tabs shares the one copy.
		return persistentLocalCache({ tabManager: persistentMultipleTabManager() });
	} catch (error) {
		console.error(error);
		return memoryLocalCache();
	}
}

// Calls onData(fields, confirmed) now and every time one of the account's documents changes - on this
// phone or on another one - with {} for a document that isn't there. Without internet, the phone's copy
// is used (see phoneCopy); confirmed is true once Firebase itself has said. Returns a function that
// stops listening.
function watchDocument(folder, name, onData, onProblem) {
	const { doc, onSnapshot } = firebase.firestoreModule;
	return onSnapshot(
		doc(firebase.db, folder, name),
		// Told also when only where the news came from changes: see below.
		{ includeMetadataChanges: true },
		(snapshot) => {
			if (snapshot.exists()) onData(snapshot.data(), !snapshot.metadata.fromCache);
			// A document that isn't there counts only when Firebase itself says so. Offline, on a phone
			// with no copy of it yet, it is missing for lack of news: taken as "no cards", the next card
			// saved would replace the account's whole list. Firebase's own word comes later, and changes
			// nothing but where the news came from - which is why those changes are asked for above.
			else if (!snapshot.metadata.fromCache) onData({}, true);
		},
		(error) => onProblem(error),
	);
}

function cleanUsername(text) {
	return text.trim().toLowerCase();
}

function isValidUsername(username) {
	return USERNAME_PATTERN.test(username);
}

function emailFor(username) {
	return username + "@" + USERNAME_EMAIL_DOMAIN;
}

function usernameOf(user) {
	return (user.email || "").split("@")[0];
}

async function createAccount(username, password) {
	await firebase.authModule.createUserWithEmailAndPassword(firebase.auth, emailFor(username), password);
}

async function signIn(username, password) {
	await firebase.authModule.signInWithEmailAndPassword(firebase.auth, emailFor(username), password);
}

async function signOutOfAccount() {
	await firebase.authModule.signOut(firebase.auth);
}

// Calls onCards(cards) now and every time the account's cards change (see watchDocument).
function watchAccountCards(username, onCards, onProblem) {
	return watchDocument(CARDS_FOLDER, username, (data) => onCards(data.cards || []), onProblem);
}

async function saveAccountCards(username, cards) {
	const { doc, setDoc, serverTimestamp } = firebase.firestoreModule;
	await setDoc(doc(firebase.db, CARDS_FOLDER, username), {
		cards: cards,
		updatedAt: serverTimestamp(),
	});
}

// Like watchAccountCards, for the learned cards' photos.
function watchAccountLearned(username, onLearned, onProblem) {
	return watchDocument(LEARNED_FOLDER, username, (data) => onLearned(data.photos || []), onProblem);
}

async function saveAccountLearned(username, photos) {
	const { doc, setDoc, serverTimestamp } = firebase.firestoreModule;
	await setDoc(doc(firebase.db, LEARNED_FOLDER, username), {
		photos: photos,
		updatedAt: serverTimestamp(),
	});
}

// ---------- Settings: the Claude key ----------

// Calls onSettings(settings) now and every time the account's settings change: { claudeKey } when
// it keeps a key, {} when it keeps none.
function watchAccountSettings(username, onSettings, onProblem) {
	return watchDocument(SETTINGS_FOLDER, username, onSettings, onProblem);
}

// Keeps a Claude key in the account; "" takes it out again.
async function saveAccountClaudeKey(username, key) {
	const { doc, setDoc, deleteDoc, serverTimestamp } = firebase.firestoreModule;
	const settings = doc(firebase.db, SETTINGS_FOLDER, username);
	if (key === "") await deleteDoc(settings);
	else await setDoc(settings, { claudeKey: key, updatedAt: serverTimestamp() });
}

// ---------- Kids' accounts ----------

// Calls onInfo(info) now and every time it changes: { parent } for a kid's account, {} for any other.
function watchAccountInfo(username, onInfo, onProblem) {
	return watchDocument(ACCOUNT_INFO_FOLDER, username, onInfo, onProblem);
}

// Calls onKids(usernames) now and every time the parent's kids change.
function watchFamily(parent, onKids, onProblem) {
	return watchDocument(FAMILIES_FOLDER, parent, (data) => onKids(data.kids || []), onProblem);
}

// Makes a kid's account under the signed-in parent's, naming its parent (see firestore.rules), and
// adds it to the parent's kids. Firebase signs in whoever an account is made for, so it is made in a
// second, hidden copy of Firebase on this phone, and the parent stays signed in here. When the
// username is taken, the password is tried on it: a kid's account made before (taken off the list,
// or half made when the internet went) comes back that way - but never another parent's kid.
async function addKidAccount(parent, kid, password) {
	const { initializeApp, deleteApp } = firebase.appModule;
	const { initializeAuth, inMemoryPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = firebase.authModule;
	const { initializeFirestore, memoryLocalCache, doc, getDoc, setDoc, arrayUnion, serverTimestamp } = firebase.firestoreModule;
	// First, a question only Firebase's rules from version 1.48.0 on allow: before them, nothing else is
	// tried, so no kid's account is made that can't be linked to its parent.
	await getDoc(doc(firebase.db, FAMILIES_FOLDER, parent));
	const helper = initializeApp(firebaseSettings(), "kid-maker-" + Date.now());
	try {
		// Signed in only in memory, never remembered on this phone.
		const auth = initializeAuth(helper, { persistence: inMemoryPersistence });
		const db = initializeFirestore(helper, { localCache: memoryLocalCache() });
		if (USE_FIREBASE_EMULATOR) useEmulator(auth, db, firebase.authModule, firebase.firestoreModule);
		try {
			await createUserWithEmailAndPassword(auth, emailFor(kid), password);
		} catch (error) {
			if (error.code !== "auth/email-already-in-use") throw error;
			// A wrong password: the username is simply taken.
			await signInWithEmailAndPassword(auth, emailFor(kid), password).catch(() => { throw error; });
		}
		const info = doc(db, ACCOUNT_INFO_FOLDER, kid);
		const known = await getDoc(info);
		if (!known.exists()) await setDoc(info, { parent: parent, createdAt: serverTimestamp() });
		else if (known.data().parent !== parent) throw kortprisError("kid-has-other-parent");
		await signOut(auth);
	} finally {
		await deleteApp(helper);
	}
	await setDoc(doc(firebase.db, FAMILIES_FOLDER, parent), { kids: arrayUnion(kid), updatedAt: serverTimestamp() }, { merge: true });
}

// Takes a kid off the parent's list: the parent no longer sees the kid's cards. The kid's account and
// cards stay, and the kid can still sign in; addKidAccount with its password brings it back.
async function removeKid(parent, kid) {
	const { doc, setDoc, arrayRemove, serverTimestamp } = firebase.firestoreModule;
	await setDoc(doc(firebase.db, FAMILIES_FOLDER, parent), { kids: arrayRemove(kid), updatedAt: serverTimestamp() }, { merge: true });
}

// Moves howMany of a saved card (entry) from one account's cards (from) to another's (to). Both lists
// are read and written together (a transaction), fresh from Firebase, so a change made on another
// phone meanwhile isn't lost. It needs internet.
async function moveSavedCard(from, to, entry, howMany) {
	const { doc, runTransaction, serverTimestamp } = firebase.firestoreModule;
	const fromDoc = doc(firebase.db, CARDS_FOLDER, from);
	const toDoc = doc(firebase.db, CARDS_FOLDER, to);
	const sameCard = (saved) => saved.id === entry.id && (saved.version || null) === (entry.version || null);
	await runTransaction(firebase.db, async (transaction) => {
		const fromCards = cardsIn(await transaction.get(fromDoc));
		const toCards = cardsIn(await transaction.get(toDoc));
		const source = fromCards.find(sameCard);
		if (!source) return;   // taken out meanwhile
		const moving = Math.min(howMany, source.count);
		source.count -= moving;
		const target = toCards.find(sameCard);
		if (target) target.count += moving;
		else toCards.push({ ...source, count: moving });
		transaction.set(fromDoc, { cards: fromCards.filter((saved) => saved.count > 0), updatedAt: serverTimestamp() });
		transaction.set(toDoc, { cards: toCards, updatedAt: serverTimestamp() });
	});
}

function cardsIn(snapshot) {
	return snapshot.exists() ? (snapshot.data().cards || []) : [];
}

// An error of the app's own, with a code like Firebase's (see accountProblem).
function kortprisError(code) {
	const error = new Error(code);
	error.code = "kortpris/" + code;
	return error;
}

// Turns a Firebase error into { key, values } for a message from strings.js.
function accountProblem(error) {
	const code = (error && error.code) || "";
	switch (code) {
		case "auth/email-already-in-use":
			return { key: "usernameTaken", values: {} };
		case "auth/invalid-credential":
		case "auth/invalid-login-credentials":
		case "auth/wrong-password":
		case "auth/user-not-found":
			return { key: "wrongLogin", values: {} };
		case "auth/too-many-requests":
			return { key: "tooManyTries", values: {} };
		case "auth/weak-password":
		case "auth/password-does-not-meet-requirements":
			return { key: "passwordRejected", values: {} };
		case "auth/operation-not-allowed":
		case "auth/admin-restricted-operation":
			return { key: "signUpClosed", values: {} };
		case "auth/configuration-not-found":
			return { key: "accountsNotSetUp", values: {} };
		case "auth/network-request-failed":
		case "unavailable":
			return { key: "noConnection", values: {} };
		case "permission-denied":
			return { key: "permissionDenied", values: {} };
		case "kortpris/kid-has-other-parent":
			return { key: "kidHasOtherParent", values: {} };
		default:
			return { key: "accountFailed", values: { code: code || String(error) } };
	}
}
