"use strict";

// Deciding whether a new password is strong enough. The rules:
// - at least MIN_PASSWORD_LENGTH characters,
// - not containing the username,
// - hard to guess, as scored by zxcvbn - a password checker made by Dropbox that knows the
//   tricks people use ("Pikachu123!", "password2026", keyboard rows, dates, l33t speak).
// Firebase also refuses passwords shorter than MIN_PASSWORD_LENGTH on its own side
// (set in the Firebase console, see SETUP-ACCOUNTS.md), so the length rule can't be skipped.

const MIN_PASSWORD_LENGTH = 10;
// zxcvbn scores 0 to 4. 3 means "safely unguessable": it would take an attacker
// with a stolen copy of the scrambled passwords a very long time.
const MIN_PASSWORD_SCORE = 3;
// Only downloaded when someone creates an account: it's big (800 KB) and rarely needed.
const ZXCVBN_URL = "https://cdnjs.cloudflare.com/ajax/libs/zxcvbn/4.4.2/zxcvbn.js";
// Words that make a password easy to guess for this app in particular.
const APP_WORDS = ["kortpris", "pokemon", "pokémon", "kort", "card", "cards"];

let checkerPromise = null;

function loadPasswordChecker() {
	if (!checkerPromise) {
		checkerPromise = new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = ZXCVBN_URL;
			script.onload = () => resolve();
			script.onerror = () => {
				checkerPromise = null;   // allow a fresh try
				reject(new Error("The password checker could not be downloaded"));
			};
			document.head.append(script);
		});
	}
	return checkerPromise;
}

// Returns { ok, problem, values, score }. problem is a text key from strings.js
// (with values to fill in), or null when the password is fine. score is 0-4, or null.
function checkNewPassword(password, username) {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return {
			ok: false,
			problem: "passwordTooShort",
			values: { min: MIN_PASSWORD_LENGTH, left: MIN_PASSWORD_LENGTH - password.length },
			score: null,
		};
	}
	if (username && password.toLowerCase().includes(username.toLowerCase())) {
		return { ok: false, problem: "passwordHasUsername", values: {}, score: 0 };
	}
	if (typeof zxcvbn !== "function") {
		return { ok: false, problem: "passwordCheckerLoading", values: {}, score: null };
	}
	// Every Pokémon name counts as an easy-to-guess word too: kids love them as passwords.
	const guessableWords = [username, ...APP_WORDS, ...POKEMON_NAMES].filter(Boolean);
	const score = zxcvbn(password, guessableWords).score;
	if (score < MIN_PASSWORD_SCORE) return { ok: false, problem: "passwordTooSimple", values: {}, score: score };
	return { ok: true, problem: null, values: {}, score: score };
}
