"use strict";

// Saving small things in this phone's browser (localStorage): the chosen language and "My cards".
// Nothing here ever leaves the phone. Private browsing can block it, so every read and
// write is wrapped: the app then works as normal, it just can't remember between visits.

function readStorage(key) {
	try {
		return localStorage.getItem(key);
	} catch (error) {
		return null;
	}
}

// Returns true when it was saved.
function writeStorage(key, value) {
	try {
		localStorage.setItem(key, value);
		return true;
	} catch (error) {
		return false;
	}
}
