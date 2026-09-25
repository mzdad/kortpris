"use strict";

// PSA prices: what a card sold for on eBay after PSA graded its condition (10 = perfect).
// No free price database the page can ask has them, so they come through the Kortpris relay
// (relay/psa-prices.js, on Cloudflare), which holds the price service's secret key.

// Where the relay is online. Empty = no relay yet: the card page then only links to eBay.
const PSA_RELAY_URL = "";
// Each card's answer is also kept on this phone for a day: the prices change once a day, and
// the free price service allows about 50 cards a day in all.
const GRADED_STORAGE_KEY = "kortpris.graded";
const GRADED_KEEP_MS = 24 * 60 * 60 * 1000;
// At most this many cards are kept, so the phone's storage doesn't fill up.
const MAX_KEPT_GRADED = 300;
// After a failed try, opening the card again tries once more when this much time has passed.
const GRADED_RETRY_MS = 60 * 1000;

// The PSA prices asked for since the page opened: card id -> { state, grades, at }.
// state is "loading", "done" or "failed"; grades is [{ grade: "10", count, median, average }],
// best grade first, prices in US dollars; at is when that state began.
const gradedByCard = new Map();

function gradedPricesAvailable() {
	return PSA_RELAY_URL !== "";
}

// The PSA prices of a card as far as they are known now. When they aren't, they are fetched,
// and onReady() is called once they arrive (or once it's clear they can't).
function gradedPricesOf(cardId, onReady) {
	const known = gradedByCard.get(cardId);
	const retry = known && known.state === "failed" && Date.now() - known.at > GRADED_RETRY_MS;
	if (!known || retry) {
		const kept = keptGradedPrices()[cardId];
		if (kept && Date.now() - kept.at < GRADED_KEEP_MS) {
			gradedByCard.set(cardId, { state: "done", grades: kept.grades, at: kept.at });
		} else {
			gradedByCard.set(cardId, { state: "loading", grades: [], at: Date.now() });
			fetchGradedPrices(cardId).then(onReady);
		}
	}
	return gradedByCard.get(cardId);
}

async function fetchGradedPrices(cardId) {
	try {
		const response = await fetch(PSA_RELAY_URL + "?card=" + encodeURIComponent(cardId));
		const answer = await response.json();
		if (!response.ok || !Array.isArray(answer.grades)) throw new Error(answer.error || "no grades");
		gradedByCard.set(cardId, { state: "done", grades: answer.grades, at: Date.now() });
		keepGradedPrices(cardId, answer.grades);
	} catch (problem) {
		console.error(problem);
		gradedByCard.set(cardId, { state: "failed", grades: [], at: Date.now() });
	}
}

function keptGradedPrices() {
	try {
		return JSON.parse(readStorage(GRADED_STORAGE_KEY) || "{}");
	} catch (error) {
		return {};
	}
}

function keepGradedPrices(cardId, grades) {
	const kept = keptGradedPrices();
	kept[cardId] = { at: Date.now(), grades: grades };
	// Oldest first out when there are too many.
	const newestFirst = Object.entries(kept).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_KEPT_GRADED);
	writeStorage(GRADED_STORAGE_KEY, JSON.stringify(Object.fromEntries(newestFirst)));
}
