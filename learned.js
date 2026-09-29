"use strict";

// Cards the app has learned from the viewer. When the viewer answers which card a photo shows (app.js
// decides what counts: tapping or typing the right card when the app couldn't tell or got it wrong,
// or saving the card it found), the app remembers how that card looked in the photo. The next photo
// of the same card is then recognised straight away, however badly its text reads.
//
// What is remembered is the blurry thumbnail of the card's artwork that matcher.js compares cards
// by, taken from the photo itself. Two photos of the same card look far more alike than a photo
// and the database's picture: same print, same wear, same sleeve, same kind of light.
// Kept on the phone (localStorage), and while someone is signed in also in their account
// (account.js), so it follows them to every phone and survives the phone's browser forgetting it.
// A few hundred photos take about half a megabyte.

const LEARNED_STORAGE_KEY = "kortpris.learned";
// The oldest are forgotten after this many photos...
const MOST_LEARNED_PHOTOS = 300;
// ...and each card keeps its latest few, from different light and angles.
const PHOTOS_PER_CARD = 3;
// Thumbnails are stored as whole numbers from -127 to 127: each value times this.
const THUMBNAIL_SCALE = 24;
// A photo is a learned card when its thumbnail is at most this far from one learned for that card
// (gridDistance in matcher.js)... Measured on 36 real photos (dev_learning_test.html, version
// 1.23.0): a made-up second photo of the same card (tilted, moved, other light) came out at 0.01
// to 0.40, and photos of different cards never closer than 0.55.
const SAME_CARD_DISTANCE = 0.42;
// ...and every other learned card is at least this many times further away.
const SAME_CARD_GAP = 2;
// A learned card the photo is at most this far from, without being clearly that card, is still
// suggested: it is added to the cards the photo is compared with (app.js), and goes first when
// nothing is clear (pickBestMatch in matcher.js)... Measured on the 40 real photos (version 1.29.0):
// with its own card not learned, a photo came this close to another learned card once, and
// within 0.7 ten times; harder made-up second photos of learned cards that weren't recognised
// came within 0.6 of their own card 13 times out of 35. At 0.7, wrong suggestions pushed the
// right card down a place four times; at 0.6, never.
const LIKE_CARD_DISTANCE = 0.6;
// ...the closest few of them.
const MOST_SUGGESTED_CARDS = 3;
// A card whose own picture is this far from the photo isn't the card in it, and isn't learned.
// On 34 real photos the right card measured 0.11 to 1.94 (the worst in warm lamp light), so this
// only keeps out the plainly unlike. Which answers count at all is decided in app.js.
const UNLIKE_CARD_DISTANCE = 2.5;

// The account side. The phone's copy is what the app reads; the account's is kept the same.
let learnedAccount = null;          // the signed-in username, or null
let learnedAccountMerged = false;   // this phone's learned cards have gone into that account
let learnedAccountProblem = null;   // why the account couldn't be read or saved: { key, values }, or null
let learnedChanged = () => {};      // app.js's redraw, for news that comes later (see whenLearnedChanges)

// Compares the photo with the cards the phone has learned. Returns { card, suggestions }: card is
// the learned card the photo clearly shows ({ cardId, name, number, setName, image }), or null;
// suggestions are the learned cards it looks somewhat like when none is clear, the closest first
// (see LIKE_CARD_DISTANCE). cardBox and textArea say where the card is in the photo (reader.js);
// without either, the photo isn't compared at all. learned is what the phone has learned,
// unless a test brings its own.
function compareWithLearned(photo, textArea, cardBox, learned = readLearned()) {
	if (learned.length === 0 || (!cardBox && !textArea)) return { card: null, suggestions: [] };
	const photoGrids = photoArtworkGrids(photo, textArea, cardBox, true);
	// The closest photo learned for each card.
	const closest = new Map();
	for (const entry of learned) {
		const distance = closestGridDistance(photoGrids, unpackThumbnail(entry.thumbnail));
		const before = closest.get(entry.cardId);
		if (!before || distance < before.distance) closest.set(entry.cardId, { entry, distance });
	}
	const ranked = [...closest.values()].sort((a, b) => a.distance - b.distance);
	const best = ranked[0];
	const clear = best.distance <= SAME_CARD_DISTANCE
		&& (ranked.length === 1 || ranked[1].distance >= best.distance * SAME_CARD_GAP);
	if (clear) return { card: best.entry, suggestions: [] };
	const suggestions = ranked.filter((entry) => entry.distance <= LIKE_CARD_DISTANCE).slice(0, MOST_SUGGESTED_CARDS);
	return { card: null, suggestions: suggestions.map((entry) => entry.entry) };
}

// The learned card the photo clearly shows, or null (see compareWithLearned).
function recogniseLearnedCard(photo, textArea, cardBox, learned = readLearned()) {
	return compareWithLearned(photo, textArea, cardBox, learned).card;
}

// The photos learned of one game's cards: "pokemon", "magic" (Magic: The Gathering) or "japanese" (Japanese
// Pokémon cards, whose ids start "ja:"). A photo is only compared with its own game's cards.
function learnedOfGame(game) {
	return readLearned().filter((entry) => gameOfCardId(entry.cardId) === game);
}

function gameOfCardId(id) {
	if (isMagicId(id)) return "magic";
	return isJapaneseId(id) ? "japanese" : "pokemon";
}

// The card a recognised photo shows, fresh from the database. But when the reader read the name
// and number of another card exactly, that one wins: the same picture is printed in several sets
// (Base Set and Base Set 2 Dratini), and only the number tells them apart. Returns what findCards
// in cards.js returns, plus learned: true - or null when the database doesn't have the card.
async function findLearnedCard(learnedCard, name, numberText, numberGuesses) {
	// For a Magic card, the set code and number read in its corner name one printing (see
	// findMagicCardsOfPhoto in magic-reader.js); a name alone doesn't.
		// A Japanese card's set code and number do (see findJapaneseCards).
		let exact;
		if (isMagicId(learnedCard.cardId)) exact = await findMagicCardsOfPhoto("", numberText);
		else if (isJapaneseId(learnedCard.cardId)) exact = await findJapaneseCards("", numberText, true, numberGuesses);
		else exact = await findExactCards(name, allNumberGuesses(numberText, numberGuesses));
		if (exact && exact.cards.length > 0 && (exact.exactFound || !isJapaneseId(learnedCard.cardId))
			&& !exact.cards.some((card) => card.id === learnedCard.cardId)) return exact;
	const cards = await findCardsById([learnedCard.cardId]);
	if (cards.length === 0) return null;
	return { cards: cards, description: { key: "matchLearned", values: {} }, totalCount: 1, exactFound: true, learned: true };
}

// Adds the learned cards the photo looks somewhat like (the suggestions of compareWithLearned) to
// what findCards in cards.js found for it, so the photo is compared with them too - unless the
// name and number were read exactly, which is surer than a look. Returns found with the cards
// added at the end, and suggestedIds: the suggested cards' ids. When the text found nothing, the
// suggestions are all there is: suggestedOnly. If the database doesn't answer, found as it was:
// the suggestions are an extra, not worth failing the search for.
async function withLearnedSuggestions(found, suggestions) {
	if (found.exactFound || found.learned || suggestions.length === 0) return found;
	let suggested;
	try {
		suggested = await findCardsById(suggestions.map((entry) => entry.cardId));
	} catch (problem) {
		console.error(problem);
		return found;
	}
	if (suggested.length === 0) return found;
	const extra = suggested.filter((card) => !found.cards.some((other) => other.id === card.id));
	const suggestedOnly = found.cards.length === 0;
	return {
		...found,
		cards: [...found.cards, ...extra],
		description: suggestedOnly ? { key: "matchLearnedSuggested", values: {} } : found.description,
		totalCount: Math.max(found.totalCount, found.cards.length + extra.length),
		suggestedIds: suggested.map((card) => card.id),
		suggestedOnly: suggestedOnly,
	};
}

// Remembers that this photo shows this card. photoKey tells photos apart: learning another card
// for the same photo (the viewer picked again) replaces what was learned from it.
// Returns true when it was learned.
async function learnCard(card, photo, textArea, cardBox, photoKey) {
	const seen = await cardInPhoto(card, photo, textArea, cardBox);
	if (!seen || seen.distance > UNLIKE_CARD_DISTANCE) return false;
	const learned = readLearned().filter((entry) => entry.photoKey !== photoKey);
	learned.push({
		cardId: card.id,
		name: card.name,
		number: collectorNumber(card),   // (an anniversary reprint has no set size: "69", not "69/null")
		setName: card.set.name,
		// (A Magic card's small picture: its list shows it small, as My cards does.)
		image: card.images ? card.images.thumb || card.images.small : null,
		thumbnail: packThumbnail(seen.grid),
		photoKey: photoKey,
		learnedAt: Date.now(),
		db: isMagicId(card.id) ? MAGIC_DATABASE : CARD_DATABASE,
	});
	return writeLearned(trimLearned(learned));
}

// Cards learned before version 1.32.0 have the old card database's ids: they get TCGdex's once,
// like saved cards (see moveSavedCardsToTcgdex in collection.js). Returns true when something
// changed.
let movingLearned = false;
async function moveLearnedToTcgdex() {
	if (movingLearned) return false;
	// (Magic cards come from Scryfall, and never had other ids.)
	const isOld = (entry) => entry.db !== CARD_DATABASE && !isMagicId(entry.cardId);
	const old = readLearned().filter(isOld);
	if (old.length === 0) return false;
	movingLearned = true;
	try {
		const current = await currentCardIds([...new Set(old.map((entry) => entry.cardId))]);
		const cards = await findCardsById([...new Set(current.values())]);
		// Read again: the list may have changed while the database was asked.
		const learned = readLearned();
		let changed = false;
		for (const entry of learned) {
			if (!isOld(entry)) continue;
			const card = cards.find((found) => found.id === current.get(entry.cardId));
			if (!card) continue;
			Object.assign(entry, {
				oldId: entry.cardId,
				cardId: card.id,
				name: card.name,
				number: collectorNumber(card),
				setName: card.set.name,
				image: card.images ? card.images.small : entry.image,
				db: CARD_DATABASE,
			});
			changed = true;
		}
		if (changed) writeLearned(learned);
		return changed;
	} finally {
		movingLearned = false;
	}
}

// Learned cards whose picture was borrowed from the old database get Scrydex's, like saved cards
// (see moveSavedPicturesToScrydex in collection.js). Returns true when something changed.
function moveLearnedPicturesToScrydex() {
	const learned = readLearned();
	let changed = false;
	for (const entry of learned) {
		if (entry.db !== CARD_DATABASE) continue;
		const picture = currentPicture(entry.cardId, entry.image);
		if (picture === entry.image) continue;
		entry.image = picture;
		changed = true;
	}
	if (changed) writeLearned(learned);
	return changed;
}

// Each photo once (the later copy wins), oldest first, and only the newest few photos of each card
// (PHOTOS_PER_CARD) and of all cards (MOST_LEARNED_PHOTOS).
function trimLearned(learned) {
	const byPhoto = new Map();
	for (const entry of learned) byPhoto.set(entry.photoKey, entry);
	const oldestFirst = [...byPhoto.values()].sort((a, b) => a.learnedAt - b.learnedAt);
	const photosOfCard = new Map();
	const kept = [];
	for (let i = oldestFirst.length - 1; i >= 0; i--) {
		const entry = oldestFirst[i];
		const photos = (photosOfCard.get(entry.cardId) || 0) + 1;
		photosOfCard.set(entry.cardId, photos);
		if (photos <= PHOTOS_PER_CARD) kept.unshift(entry);
	}
	return kept.slice(-MOST_LEARNED_PHOTOS);
}

// Keeps the learned photos on the phone, and in the account when someone is signed in.
// Returns true when they were kept somewhere.
function writeLearned(learned) {
	const onPhone = writeStorage(LEARNED_STORAGE_KEY, JSON.stringify(learned));
	const inAccount = learnedAccount !== null && learnedAccountMerged;
	if (inAccount) saveLearnedInAccount(learned);
	return onPhone || inAccount;
}

function saveLearnedInAccount(learned) {
	// Saved in the background; a problem shows under the list of learned cards.
	const username = learnedAccount;
	saveAccountLearned(username, learned).then(() => {
		if (learnedAccount !== username) return;
		learnedAccountProblem = null;
		learnedChanged();
	}, (error) => {
		console.error(error);
		if (learnedAccount !== username) return;
		learnedAccountProblem = accountProblem(error);
		learnedChanged();
	});
}

// Someone signed in (username), or out (null).
function useLearnedAccount(username) {
	learnedAccount = username;
	learnedAccountMerged = false;
	learnedAccountProblem = null;
}

// The signed-in account's learned photos arrived, now or again later (also when another phone
// changed them).
function useAccountLearned(photos) {
	learnedAccountProblem = null;
	if (!learnedAccountMerged) {
		// The first time, this phone's learned cards join the account's, and both keep them all.
		learnedAccountMerged = true;
		const merged = trimLearned([...photos, ...readLearned()]);
		writeStorage(LEARNED_STORAGE_KEY, JSON.stringify(merged));
		const samePhotos = merged.length === photos.length && merged.every((entry) => photos.some((other) => other.photoKey === entry.photoKey));
		if (!samePhotos) saveLearnedInAccount(merged);
		return;
	}
	// After that the account is right: a card learned or forgotten on another phone shows up here too.
	writeStorage(LEARNED_STORAGE_KEY, JSON.stringify(trimLearned(photos)));
}

function learnedAccountFailed(error) {
	learnedAccountProblem = accountProblem(error);
}

// Where the learned cards are kept: { account, problem }, for the list's small print.
function learnedPlace() {
	return { account: learnedAccount, problem: learnedAccountProblem };
}

function whenLearnedChanges(redraw) {
	learnedChanged = redraw;
}

// The card's artwork as it looks in the photo: { grid, distance }, the thumbnail from the place in
// the photo most like the card's own picture, and how far it is from that picture. null when the
// card's place in the photo isn't known.
async function cardInPhoto(card, photo, textArea, cardBox) {
	if ((!cardBox && !textArea) || !card.images) return null;
	// The picture rankByLook in matcher.js compared: a Magic card's smallest one.
	const picture = await loadPicture(card.images.thumb || card.images.small);
	const cardGrid = colourGrid(picture, artworkOf({ x0: 0, y0: 0, x1: picture.width, y1: picture.height }));
	let best = { grid: null, distance: Infinity };
	for (const grid of photoArtworkGrids(photo, textArea, cardBox, true)) {
		const distance = gridDistance(grid, cardGrid);
		if (distance < best.distance) best = { grid, distance };
	}
	return best;
}

// The cards learned, newest first, each once: [{ cardId, name, number, setName, image, photos }].
function learnedCards() {
	const cards = new Map();
	for (const entry of readLearned().reverse()) {
		if (cards.has(entry.cardId)) cards.get(entry.cardId).photos++;
		else cards.set(entry.cardId, { ...entry, photos: 1 });
	}
	return [...cards.values()];
}

function forgetLearnedCard(cardId) {
	writeLearned(readLearned().filter((entry) => entry.cardId !== cardId));
}

function forgetAllLearned() {
	writeLearned([]);
}

function readLearned() {
	try {
		const learned = JSON.parse(readStorage(LEARNED_STORAGE_KEY) || "[]");
		return Array.isArray(learned) ? learned : [];
	} catch (error) {
		return [];   // spoilt somehow: start again rather than break the app
	}
}

function packThumbnail(grid) {
	// One letter per value, then base64 so it is plain text: about 1,300 letters per photo.
	let letters = "";
	for (const value of grid) {
		const whole = Math.max(-127, Math.min(127, Math.round(value * THUMBNAIL_SCALE)));
		letters += String.fromCharCode(whole + 128);
	}
	return btoa(letters);
}

function unpackThumbnail(packed) {
	const letters = atob(packed);
	const grid = new Float32Array(letters.length);
	for (let i = 0; i < letters.length; i++) grid[i] = (letters.charCodeAt(i) - 128) / THUMBNAIL_SCALE;
	return grid;
}
