"use strict";

// "My cards": the cards the viewer has saved, with how many of each, kept in this phone's
// browser storage. It uses a few helpers from app.js (like bestCardmarketPrice) - those
// only run after every file has loaded, so the order of the <script> tags doesn't matter.

const COLLECTION_STORAGE_KEY = "kortpris.collection";
// Prices are updated this many cards at a time: the database answers one group per request.
const REFRESH_BATCH_SIZE = 25;

// Each saved card looks like:
// { id, name, setName, number, image, count, priceEur, updatedAt, priceUsd, usdVersion }
// Only what "My cards" shows is kept, so even a big collection fits in the browser's storage.
let collection = loadCollection();

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

// Returns true when it was saved.
function saveCollection() {
	return writeStorage(COLLECTION_STORAGE_KEY, JSON.stringify(collection));
}

function savedCount(cardId) {
	const entry = collection.find((saved) => saved.id === cardId);
	return entry ? entry.count : 0;
}

// Returns true when it was saved.
function addToCollection(card) {
	const entry = collection.find((saved) => saved.id === card.id);
	if (entry) {
		entry.count++;
		Object.assign(entry, pricesOf(card));   // take the chance to freshen its prices
	} else {
		collection.push({
			id: card.id,
			name: card.name,
			setName: card.set.name,
			number: collectorNumber(card),
			image: card.images.small,
			count: 1,
			...pricesOf(card),
		});
	}
	return saveCollection();
}

// change is +1 or -1. At zero the card leaves the list.
function changeSavedCount(cardId, change) {
	const entry = collection.find((saved) => saved.id === cardId);
	if (!entry) return;
	entry.count += change;
	if (entry.count <= 0) collection = collection.filter((saved) => saved.id !== cardId);
	saveCollection();
}

function pricesOf(card) {
	// The same prices the card's own page leads with: Cardmarket in euros, TCGplayer in dollars.
	const cardmarket = bestCardmarketPrice(card.cardmarket);
	const tcgplayer = tcgplayerVariants(card.tcgplayer).find((variant) => variant.price.market > 0);
	return {
		priceEur: cardmarket ? cardmarket.value : null,
		updatedAt: card.cardmarket ? card.cardmarket.updatedAt : null,
		priceUsd: tcgplayer ? tcgplayer.price.market : null,
		usdVersion: tcgplayer ? tcgplayer.textKey : null,
	};
}

async function refreshCollectionPrices() {
	// Asks for the saved cards a group at a time: "(id:base1-4 OR id:xy12-11 OR ...)".
	const ids = collection.map((saved) => saved.id);
	for (let start = 0; start < ids.length; start += REFRESH_BATCH_SIZE) {
		const group = ids.slice(start, start + REFRESH_BATCH_SIZE);
		const query = "(" + group.map((id) => "id:" + id).join(" OR ") + ")";
		for (const card of await fetchCards(query, REFRESH_BATCH_SIZE)) {
			const entry = collection.find((saved) => saved.id === card.id);
			if (entry) Object.assign(entry, pricesOf(card));
		}
	}
	saveCollection();
}

function collectionTotals() {
	// The total is in kroner from Cardmarket prices. Cards without one are counted separately
	// rather than guessed: TCGplayer's dollars can't be turned into kroner without today's rate.
	const totals = { kroner: 0, cards: 0, unpriced: 0, oldestUpdate: null };
	for (const entry of collection) {
		totals.cards += entry.count;
		if (entry.priceEur > 0) totals.kroner += entry.count * entry.priceEur * DKK_PER_EUR;
		else totals.unpriced += entry.count;
		// Dates look like "2026/07/01", so comparing them as text puts them in date order.
		if (entry.updatedAt && (!totals.oldestUpdate || entry.updatedAt < totals.oldestUpdate)) {
			totals.oldestUpdate = entry.updatedAt;
		}
	}
	return totals;
}
