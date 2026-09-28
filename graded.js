"use strict";

// PSA prices: what a card sold for on eBay after PSA graded its condition (10 = perfect), and
// the same for the other grading companies (CGC, BGS, SGC, TAG, ACE).
// No free price database the page can ask has them, so they come through the Kortpris relay
// (relay/psa-prices.js, on Cloudflare), which holds the price service's secret key. The price
// service knows a card by its TCGplayer product number, which comes with the card's prices
// (card.tcgplayer.productId, see withPrices in cards.js).

// Where the relay is online. Empty = no relay: the card page then only links to eBay.
const PSA_RELAY_URL = "https://kortpris-psa.kortpris.workers.dev/";
// Each card's answer is also kept on this phone for a day: the prices change once a day, and
// the free price service allows about 50 cards a day in all (see also fetchPsaPrices below).
// ("kortpris.graded" held them without the other companies until 1.41.0, and is removed.)
const GRADED_STORAGE_KEY = "kortpris.graded2";
removeStorage("kortpris.graded");
const GRADED_KEEP_MS = 24 * 60 * 60 * 1000;
// At most this many cards are kept, so the phone's storage doesn't fill up.
const MAX_KEPT_GRADED = 300;
// After a failed try, opening the card again tries once more when this much time has passed.
const GRADED_RETRY_MS = 60 * 1000;
// Whether PSA prices are fetched for every card opened. Off unless ticked on the card page,
// so the day's allowance isn't spent on cards nobody wanted PSA prices for. Kept per phone.
const FETCH_PSA_STORAGE_KEY = "kortpris.fetchPsa";
let fetchPsaPrices = readStorage(FETCH_PSA_STORAGE_KEY) === "yes";

function setFetchPsaPrices(on) {
	fetchPsaPrices = on;
	writeStorage(FETCH_PSA_STORAGE_KEY, on ? "yes" : "no");
}

// How many more cards the price service allows today, and when that refills: { cardsLeft,
// resetsAt } as the relay last said, or null before it has. Shown next to the tick box.
let psaAllowance = null;
let psaAllowanceAsked = false;

// The allowance as far as it is known now. The first time (and again after the refill time),
// the relay is asked - which costs nothing - and onReady() is called with the answer.
function psaAllowanceNow(onReady) {
	if (psaAllowance && Date.now() >= psaAllowance.resetsAt.getTime()) psaAllowanceAsked = false;
	if (!psaAllowanceAsked) {
		psaAllowanceAsked = true;
		fetch(PSA_RELAY_URL + "?credits=1")
			.then((response) => response.json())
			.then((answer) => {
				noteAllowance(answer);
				onReady();
			})
			.catch((problem) => {
				// No count shown; the prices still work. Asked again the next time a card page is drawn, a
				// minute from now at the soonest (until 1.53.0, not again until the app was opened again).
				console.error(problem);
				setTimeout(() => { psaAllowanceAsked = false; }, GRADED_RETRY_MS);
			});
	}
	return psaAllowance;
}

function psaRefillTime() {
	// The price service refills the day's lookups at midnight UTC (02:00 in a Danish summer).
	if (psaAllowance) return psaAllowance.resetsAt;
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function noteAllowance(answer) {
	// Every answer from the relay carries the day's count.
	if (Number.isFinite(answer.cardsLeft) && answer.resetsAt) {
		psaAllowance = { cardsLeft: answer.cardsLeft, resetsAt: new Date(answer.resetsAt) };
	}
}

// The graded prices asked for since the page opened: card id -> { state, grades, others, at }.
// state is "loading", "done", "failed" or "usedUp" (none left today);
// grades is PSA's: [{ grade: "10", count, median, average, price, sure, lastSale }], best grade
// first, prices in US dollars (see relay/psa-prices.js for each part);
// others is the other companies' in the same shape, each with its company: "CGC";
// at is when that state began.
const gradedByCard = new Map();

function gradedPricesAvailable() {
	return PSA_RELAY_URL !== "";
}

// The PSA prices of a card as far as they are known now. When they aren't, they are fetched -
// only while fetchPsaPrices is on - and onReady() is called once they arrive (or once it's
// clear they can't). state "off" means not known and not fetched.
function gradedPricesOf(card, onReady) {
	const cardId = card.id;
	const known = gradedByCard.get(cardId);
	const retry = known && (known.state === "failed" || known.state === "usedUp") && Date.now() - known.at > GRADED_RETRY_MS;
	if (!known || retry) {
		// Fetched earlier and less than a day old: shown for free, even when fetching is off.
		const kept = keptGradedPrices()[cardId];
		if (kept && Date.now() - kept.at < GRADED_KEEP_MS) {
			gradedByCard.set(cardId, { state: "done", grades: kept.grades, others: kept.others || [], at: kept.at });
		} else if (!fetchPsaPrices) {
			return { state: "off", grades: [], others: [] };
		} else if (!(card.tcgplayer && card.tcgplayer.productId)) {
			// Not sold on TCGplayer, so the price service doesn't know it either: nothing to ask.
			gradedByCard.set(cardId, { state: "done", grades: [], others: [], at: Date.now() });
		} else {
			gradedByCard.set(cardId, { state: "loading", grades: [], others: [], at: Date.now() });
			fetchGradedPrices(cardId, card.tcgplayer.productId).then(onReady);
		}
	}
	return gradedByCard.get(cardId);
}

async function fetchGradedPrices(cardId, productId) {
	try {
		const response = await fetch(PSA_RELAY_URL + "?product=" + encodeURIComponent(productId));
		const answer = await response.json();
		noteAllowance(answer);
		if (response.status === 429) {
			// The day's lookups are used up: not a fault, so it gets its own message.
			gradedByCard.set(cardId, { state: "usedUp", grades: [], others: [], at: Date.now() });
			return;
		}
		if (!response.ok || !Array.isArray(answer.grades)) throw new Error(answer.error || "no grades");
		// otherGrades is missing from an answer the relay remembered before it passed them on.
		const others = Array.isArray(answer.otherGrades) ? answer.otherGrades : [];
		gradedByCard.set(cardId, { state: "done", grades: answer.grades, others: others, at: Date.now() });
		keepGradedPrices(cardId, answer.grades, others);
	} catch (problem) {
		console.error(problem);
		gradedByCard.set(cardId, { state: "failed", grades: [], others: [], at: Date.now() });
	}
}

function keptGradedPrices() {
	try {
		return JSON.parse(readStorage(GRADED_STORAGE_KEY) || "{}");
	} catch (error) {
		return {};
	}
}

function keepGradedPrices(cardId, grades, others) {
	const kept = keptGradedPrices();
	kept[cardId] = { at: Date.now(), grades: grades, others: others };
	// Oldest first out when there are too many.
	const newestFirst = Object.entries(kept).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_KEPT_GRADED);
	writeStorage(GRADED_STORAGE_KEY, JSON.stringify(Object.fromEntries(newestFirst)));
}
