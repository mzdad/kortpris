"use strict";

// "My cards": the cards the viewer has saved, with how many of each. Without an account they
// are kept in this phone's browser storage; when someone is signed in, in their account
// (account.js). It uses a few helpers from app.js (like bestCardmarketPrice) - those only
// run after every file has loaded, so the order of the <script> tags doesn't matter.

const COLLECTION_STORAGE_KEY = "kortpris.collection";
// Saved cards are asked for this many at a time, and then their prices this many at a time: the
// database gives prices one card at a time (see withPrices in cards.js).
const REFRESH_BATCH_SIZE = 25;
const PRICE_REQUESTS_AT_ONCE = 6;

// Each saved card looks like:
// { id, version, name, setName, number, image, count, priceEur, updatedAt, priceUsd, kind }
// version is which print it is, like "reverseHolofoil" (cards saved before versions existed
// have none until their page is opened, see nameSavedVersion). The same card in two versions is
// two entries, because their prices differ.
// Only what "My cards" shows is kept, so even a big collection fits in the browser's storage.
// kind is the database's "supertype": "Pokémon", "Trainer" or "Energy" (see CARD_KINDS). Cards
// saved before version 1.25.0 have none until fillMissingKinds has asked the database.
let collection = loadCollection();
// "My cards" is split into these, in this order.
const CARD_KINDS = ["Pokémon", "Trainer", "Energy"];
// fillMissingKinds has run: once per visit is enough, even when the database didn't answer.
let kindsAsked = false;
// When someone is signed in, their cards live in their account instead of on this phone.
let accountName = null;           // the signed-in username, or null
// Whose cards My cards shows and changes: the account's own, or one of its kids' (see
// showCollectionOf). null without an account.
let collectionOwner = null;
let accountCardsLoaded = false;   // those cards have arrived from Firebase
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

// Returns true when it was saved (or, with an account, sent off to be saved). Never before the account's
// cards have arrived (see collectionReady): the list is empty until then, and saving it would wipe the
// account's cards - as "Update prices" did in versions before 1.53.0, when a kid's cards were picked, or
// someone signed in, while it was still running.
function saveCollection() {
	if (!collectionReady()) return false;
	if (accountName) {
		// The screen shows the change at once; Firebase saves it in the background,
		// and keeps trying if the phone is briefly offline.
		saveAccountCards(collectionOwner, collection).then(
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
	showCollectionOf(username);
}

// A parent's own cards, or a kid's (owner: a username), to be shown once they arrive.
function showCollectionOf(owner) {
	collectionOwner = owner;
	accountCardsLoaded = false;
	accountSaveProblem = null;
	collection = [];
}

// My cards shows a kid's cards, not the account's own.
function showingKidsCards() {
	return accountName !== null && collectionOwner !== accountName;
}

function useAccountCards(cards) {
	accountCardsLoaded = true;
	collection = cards;
}

function usePhoneCollection() {
	accountName = null;
	collectionOwner = null;
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
		// The same card in the same version: a reverse holo is kept apart from the normal print.
		const existing = findSaved(entry.id, entry.version);
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
			image: card.images ? card.images.small : null,
			count: 1,
			kind: card.supertype,
			db: CARD_DATABASE,
			...pricesOf(card, version),
		});
	}
	return saveCollection();
}

// Adds their prices to these cards, a few at a time (see withPrices in cards.js). fresh = true asks
// the database again, rather than taking the prices kept on the phone.
async function withPricesOf(cards, fresh = false) {
	for (let at = 0; at < cards.length; at += PRICE_REQUESTS_AT_ONCE) {
		await Promise.all(cards.slice(at, at + PRICE_REQUESTS_AT_ONCE).map((card) => withPrices(card, fresh)));
	}
}

// Cards saved before version 1.32.0 have the old card database's ids (pokemontcg.io). They get
// TCGdex's once, with its picture, set name and number - and today's prices, as the old database's
// were often months old - and are marked db: "tcgdex"; the old id is kept as oldId, just in case. A
// card TCGdex doesn't have keeps its old id, and is tried again next time. Returns true when
// something changed.
let movingSavedCards = false;
async function moveSavedCardsToTcgdex() {
	if (movingSavedCards || !collectionReady()) return false;
	const oldIds = [...new Set(collection.filter((entry) => entry.db !== CARD_DATABASE).map((entry) => entry.id))];
	if (oldIds.length === 0) return false;
	movingSavedCards = true;
	try {
		const current = await currentCardIds(oldIds);
		const cards = await findCardsById([...new Set(current.values())]);
		try {
			await withPricesOf(cards);
		} catch (error) {
			console.error(error);   // those without prices keep their old ones until "Update prices"
		}
		// The list may have been read again meanwhile (signing in or out, another phone): the cards
		// in it now are the ones translated - by their old id, which fits any list.
		if (!collectionReady()) return false;
		let changed = false;
		for (const entry of collection) {
			if (entry.db === CARD_DATABASE) continue;
			const card = cards.find((found) => found.id === current.get(entry.id));
			if (!card) continue;
			Object.assign(entry, {
				oldId: entry.id,
				id: card.id,
				name: card.name,
				setName: card.set.name,
				number: collectorNumber(card),
				image: card.images ? card.images.small : entry.image,
				kind: card.supertype,
				db: CARD_DATABASE,
			});
			if (card.pricesLoaded) Object.assign(entry, pricesOf(card, entry.version));
			changed = true;
		}
		if (!changed) return false;
		collection = sameCardsTogether(collection);
		saveCollection();
		return true;
	} finally {
		movingSavedCards = false;
	}
}

// Saved cards whose picture was borrowed from the old database get Scrydex's (see currentPicture in
// cards.js). Returns true when something changed.
function moveSavedPicturesToScrydex() {
	if (!collectionReady()) return false;
	let changed = false;
	for (const entry of collection) {
		if (entry.db !== CARD_DATABASE) continue;   // moved to TCGdex first, with its picture
		const picture = currentPicture(entry.id, entry.image);
		if (picture === entry.image) continue;
		entry.image = picture;
		changed = true;
	}
	if (changed) saveCollection();
	return changed;
}

function sameCardsTogether(entries) {
	// The same card in the same version once, with the counts added up: a card saved both before
	// and after the move to TCGdex.
	const together = [];
	for (const entry of entries) {
		const same = together.find((kept) => kept.id === entry.id && (kept.version || null) === (entry.version || null));
		if (same) same.count += entry.count;
		else together.push(entry);
	}
	return together;
}

// A card saved before versions were kept (the app's first day) has none, and its price is its main
// version's (see pricesOf). When its page opens, that version is saved with it, so the page shows
// it as the one saved, and "Add one more" there adds to it. Returns the version.
function nameSavedVersion(card) {
	const key = versionOf(card, null).key;
	const entry = findSaved(card.id, null);
	if (entry && collectionReady()) {
		entry.version = key;
		collection = sameCardsTogether(collection);   // it may be saved in that version already
		saveCollection();
	}
	return key;
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
	// The saved version's prices: Cardmarket in euros, TCGplayer in dollars. A card saved before
	// versions were kept gets its main version's, not the one last picked on the Scan screen.
	const chosen = versionOf(card, version || null);
	return {
		priceEur: chosen.eur,
		updatedAt: card.cardmarket ? card.cardmarket.updatedAt : null,
		priceUsd: chosen.usd,
	};
}

// "Update prices": today's prices, even for cards whose prices were kept earlier today. Returns true when
// done; false when My cards shows another list meanwhile (a kid's picked, or someone signed in or out),
// which is then left alone.
async function refreshCollectionPrices() {
	const owner = collectionOwner;
	const account = accountName;
	const sameList = () => collectionOwner === owner && accountName === account;
	const ids = [...new Set(collection.map((saved) => saved.id))];   // each card once, even if saved in two versions
	for (let start = 0; start < ids.length; start += REFRESH_BATCH_SIZE) {
		const cards = await findCardsById(ids.slice(start, start + REFRESH_BATCH_SIZE));
		await withPricesOf(cards, true);
		if (!sameList()) return false;
		for (const card of cards) {
			for (const entry of collection.filter((saved) => saved.id === card.id)) {
				Object.assign(entry, pricesOf(card, entry.version));
				entry.kind = card.supertype;
			}
		}
	}
	saveCollection();
	return true;
}

// Which part of "My cards" a saved card goes in: one of CARD_KINDS. Cards saved before kinds were
// kept are guessed from their name until fillMissingKinds knows better.
function cardKind(entry) {
	if (CARD_KINDS.includes(entry.kind)) return entry.kind;
	const name = entry.name || "";
	if (ENERGY_NAMES.includes(name)) return "Energy";
	// Before the word "Energy": "Energy Removal" is a Trainer card.
	if (TRAINER_NAMES.includes(name)) return "Trainer";
	if (/\benergy\b/i.test(name)) return "Energy";
	return "Pokémon";
}

// Asks the database what kind each card saved without one is, and saves the answers. Returns true
// when something changed.
async function fillMissingKinds() {
	if (kindsAsked || !collectionReady()) return false;
	kindsAsked = true;
	const ids = [...new Set(collection.filter((entry) => !entry.kind).map((entry) => entry.id))];
	if (ids.length === 0) return false;
	let changed = false;
	for (let start = 0; start < ids.length; start += REFRESH_BATCH_SIZE) {
		for (const card of await findCardsById(ids.slice(start, start + REFRESH_BATCH_SIZE))) {
			for (const entry of collection.filter((saved) => saved.id === card.id)) {
				entry.kind = card.supertype;
				changed = true;
			}
		}
	}
	if (changed) saveCollection();
	return changed;
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
