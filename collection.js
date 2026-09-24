"use strict";

// "My cards": the cards the viewer has saved, with how many of each. Without an account they
// are kept in this phone's browser storage; when someone is signed in, in their account
// (account.js). It uses a few helpers from app.js (like bestCardmarketPrice) - those only
// run after every file has loaded, so the order of the <script> tags doesn't matter.

const COLLECTION_STORAGE_KEY = "kortpris.collection";
// Prices are updated this many cards at a time: the database answers one group per request.
const REFRESH_BATCH_SIZE = 25;

// Each saved card looks like:
// { id, version, name, setName, number, image, count, priceEur, updatedAt, priceUsd }
// version is which print it is, like "reverseHolofoil" (cards saved before versions existed
// have none). The same card in two versions is two entries, because their prices differ.
// Only what "My cards" shows is kept, so even a big collection fits in the browser's storage.
let collection = loadCollection();
// When someone is signed in, their cards live in their account instead of on this phone.
let accountName = null;           // the signed-in username, or null
let accountCardsLoaded = false;   // the account's cards have arrived from Firebase
let accountSaveProblem = null;    // why the last save to the account failed: { key, values }, or null

function loadCollection() {
	const saved = readStorage(COLLECTION_STORAGE_KEY);
	if (!saved) return [];
	try {
		const parsed = JSON.parse(saved);
		return Array.isArray(parsed) ? parsed : [];
	} catch (error) {
		return [];   // damaged data: start with an empty list rather than crash
	}
}

// Returns true when it was saved (or, with an account, sent off to be saved).
function saveCollection() {
	if (accountName) {
		// The screen shows the change at once; Firebase saves it in the background,
		// and keeps trying if the phone is briefly offline.
		saveAccountCards(accountName, collection).then(
			() => {
				accountSaveProblem = null;
				renderCollection();
			},
			(error) => {
				console.error(error);
				accountSaveProblem = accountProblem(error);
				renderCollection();
			},
		);
		return true;
	}
	return writeStorage(COLLECTION_STORAGE_KEY, JSON.stringify(collection));
}

// True when "My cards" may be changed: always without an account, and with one as soon as
// its cards have arrived. Saving before that would overwrite the account with an empty list.
function collectionReady() {
	return accountName === null || accountCardsLoaded;
}

function useAccountCollection(username) {
	accountName = username;
	accountCardsLoaded = false;
	accountSaveProblem = null;
	collection = [];
}

function useAccountCards(cards) {
	accountCardsLoaded = true;
	collection = cards;
}

function usePhoneCollection() {
	accountName = null;
	accountCardsLoaded = false;
	accountSaveProblem = null;
	collection = loadCollection();
}

// How many cards are saved on this phone outside any account.
function phoneCardCount() {
	return loadCollection().reduce((total, entry) => total + entry.count, 0);
}

function movePhoneCardsIntoAccount() {
	for (const entry of loadCollection()) {
		const existing = collection.find((saved) => saved.id === entry.id);
		if (existing) existing.count += entry.count;
		else collection.push(entry);
	}
	removeStorage(COLLECTION_STORAGE_KEY);
	saveCollection();
}

function findSaved(cardId, version) {
	return collection.find((saved) => saved.id === cardId && (saved.version || null) === (version || null));
}

function savedCount(cardId, version) {
	const entry = findSaved(cardId, version);
	return entry ? entry.count : 0;
}

// Returns true when it was saved.
function addToCollection(card, version) {
	const entry = findSaved(card.id, version);
	if (entry) {
		entry.count++;
		Object.assign(entry, pricesOf(card, version));   // take the chance to freshen its prices
	} else {
		collection.push({
			id: card.id,
			version: version,
			name: card.name,
			setName: card.set.name,
			number: collectorNumber(card),
			image: card.images.small,
			count: 1,
			...pricesOf(card, version),
		});
	}
	return saveCollection();
}

// change is +1 or -1. At zero the card leaves the list.
function changeSavedCount(cardId, version, change) {
	const entry = findSaved(cardId, version);
	if (!entry) return;
	entry.count += change;
	if (entry.count <= 0) collection = collection.filter((saved) => saved !== entry);
	saveCollection();
}

function pricesOf(card, version) {
	// The saved version's prices: Cardmarket in euros, TCGplayer in dollars.
	const chosen = versionOf(card, version);
	return {
		priceEur: chosen.eur,
		updatedAt: card.cardmarket ? card.cardmarket.updatedAt : null,
		priceUsd: chosen.usd,
	};
}

async function refreshCollectionPrices() {
	// Asks for the saved cards a group at a time: "(id:base1-4 OR id:xy12-11 OR ...)".
	const ids = [...new Set(collection.map((saved) => saved.id))];   // each card once, even if saved in two versions
	for (let start = 0; start < ids.length; start += REFRESH_BATCH_SIZE) {
		const group = ids.slice(start, start + REFRESH_BATCH_SIZE);
		const query = "(" + group.map((id) => "id:" + id).join(" OR ") + ")";
		for (const card of await fetchCards(query, REFRESH_BATCH_SIZE)) {
			for (const entry of collection.filter((saved) => saved.id === card.id)) {
				Object.assign(entry, pricesOf(card, entry.version));
			}
		}
	}
	saveCollection();
}

function collectionTotals(entries = collection) {
	// The total is in the shown currency: each card's Cardmarket price, or TCGplayer's when
	// Cardmarket has none (see localPrice in app.js). Cards with neither are counted separately
	// rather than guessed. entries can be part of the collection, like the cards a search found.
	const totals = { value: 0, cards: 0, unpriced: 0, oldestUpdate: null };
	for (const entry of entries) {
		totals.cards += entry.count;
		const each = localPrice(entry.priceEur, entry.priceUsd);
		if (each !== null) totals.value += entry.count * each;
		else totals.unpriced += entry.count;
		// Dates look like "2026/07/01", so comparing them as text puts them in date order.
		if (entry.updatedAt && (!totals.oldestUpdate || entry.updatedAt < totals.oldestUpdate)) {
			totals.oldestUpdate = entry.updatedAt;
		}
	}
	return totals;
}
