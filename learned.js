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
// A card whose own picture is this far from the photo isn't the card in it, and isn't learned.
// On 34 real photos the right card measured 0.11 to 1.94 (the worst in warm lamp light), so this
// only keeps out the plainly unlike. Which answers count at all is decided in app.js.
const UNLIKE_CARD_DISTANCE = 2.5;

// The account side. The phone's copy is what the app reads; the account's is kept the same.
let learnedAccount = null;          // the signed-in username, or null
let learnedAccountMerged = false;   // this phone's learned cards have gone into that account
let learnedAccountProblem = null;   // why the account couldn't be read or saved: { key, values }, or null
let learnedChanged = () => {};      // app.js's redraw, for news that comes later (see whenLearnedChanges)

// Returns the learned card the photo shows: { cardId, name, number, setName, image }, or null
// when it doesn't look clearly like one. cardBox and textArea say where the card is in the
// photo (reader.js); without either, the photo isn't compared at all. learned is what the
// phone has learned, unless a test brings its own.
function recogniseLearnedCard(photo, textArea, cardBox, learned = readLearned()) {
	if (learned.length === 0 || (!cardBox && !textArea)) return null;
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
	if (best.distance > SAME_CARD_DISTANCE) return null;
	if (ranked.length > 1 && ranked[1].distance < best.distance * SAME_CARD_GAP) return null;
	return best.entry;
}

// The card a recognised photo shows, fresh from the database. But when the reader read the name
// and number of another card exactly, that one wins: the same picture is printed in several sets
// (Base Set and Base Set 2 Dratini), and only the number tells them apart. Returns what findCards
// in cards.js returns, plus learned: true - or null when the database doesn't have the card.
async function findLearnedCard(learnedCard, name, numberText, numberGuesses) {
	const exact = await findExactCards(name, allNumberGuesses(numberText, numberGuesses));
	if (exact && !exact.cards.some((card) => card.id === learnedCard.cardId)) return exact;
	const cards = await findCardsById([learnedCard.cardId]);
	if (cards.length === 0) return null;
	return { cards: cards, description: { key: "matchLearned", values: {} }, totalCount: 1, exactFound: true, learned: true };
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
		number: card.number + "/" + card.set.printedTotal,
		setName: card.set.name,
		image: card.images.small,
		thumbnail: packThumbnail(seen.grid),
		photoKey: photoKey,
		learnedAt: Date.now(),
	});
	return writeLearned(trimLearned(learned));
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
	if (!cardBox && !textArea) return null;
	const picture = await loadPicture(card.images.small);
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
