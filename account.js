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
// Firestore: each account's cards are in the document collections/<username>, and the cards the
// app has learned for it (learned.js) in learned/<username>.
const CARDS_FOLDER = "collections";
const LEARNED_FOLDER = "learned";
// Lowercase letters a-z, digits, - and _. Letters like æ, ø and å can't be in an email address.
const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;

let firebase = null;   // { auth, db, authModule, firestoreModule } once started

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
	const app = appModule.initializeApp(USE_FIREBASE_EMULATOR ? EMULATOR_CONFIG : FIREBASE_CONFIG);
	const auth = authModule.getAuth(app);
	const db = firestoreModule.getFirestore(app);
	if (USE_FIREBASE_EMULATOR) {
		authModule.connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
		firestoreModule.connectFirestoreEmulator(db, "localhost", 8080);
	}
	firebase = { auth, db, authModule, firestoreModule };
	authModule.onAuthStateChanged(auth, (user) => onAccountChange(user ? usernameOf(user) : null));
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

// Calls onCards(cards) now and every time the account's cards change - on this phone or on
// another one. Returns a function that stops listening.
function watchAccountCards(username, onCards, onProblem) {
	const { doc, onSnapshot } = firebase.firestoreModule;
	return onSnapshot(
		doc(firebase.db, CARDS_FOLDER, username),
		(snapshot) => onCards(snapshot.exists() ? (snapshot.data().cards || []) : []),
		(error) => onProblem(error),
	);
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
	const { doc, onSnapshot } = firebase.firestoreModule;
	return onSnapshot(
		doc(firebase.db, LEARNED_FOLDER, username),
		(snapshot) => onLearned(snapshot.exists() ? (snapshot.data().photos || []) : []),
		(error) => onProblem(error),
	);
}

async function saveAccountLearned(username, photos) {
	const { doc, setDoc, serverTimestamp } = firebase.firestoreModule;
	await setDoc(doc(firebase.db, LEARNED_FOLDER, username), {
		photos: photos,
		updatedAt: serverTimestamp(),
	});
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
		default:
			return { key: "accountFailed", values: { code: code || String(error) } };
	}
}
