"use strict";

// Reads a photo of a Japanese Pokémon card (roadmap 6.1): its number and its set's code, printed in plain
// letters in the bottom-left corner: "G [sv2a] 151/165 RR" - the regulation mark, the set's code in a little
// box, the number and the size of the set, the rarity. The text reader knows English only, so the name
// (in Japanese) is not read at all: the number, the set's size and the code find the cards in TCGdex's
// Japanese database (findJapaneseCards in japanese.js), and their pictures, compared with the photo,
// settle which of the cards that fit is the one (pickJapaneseCard).
// It uses the number reader and the card finder of Pokémon cards (reader.js, card-finder.js).
// dev_japanese_test.html measures how well this works - run it after every change here.

// Ways of reading the corner for the set's code, in turn, until one finds a code that fits the number's
// set size. The code is tiny, and the ways read different cards' codes: on 80 cards from 40 sets (made-up
// photos, version 1.64.0) the first read 13, and these four together 30 - the best single way of 16 tried
// found 13, all 16 together 38. (Real photos have more detail than the pictures the made-up ones are made from.)
const JAPANESE_CODE_READS = [
	{ cardWidth: 3200, ink: "dark", mode: "ink" },
	{ cardWidth: 3200, ink: "light", mode: "ink" },
	{ cardWidth: 2500, ink: "", mode: "scattered" },
	{ cardWidth: 2500, ink: "", mode: "block" },
];
const JAPANESE_CODE_PLACE = { x0: 0.02, x1: 0.45, y0: 0.90, y1: 0.995 };
// A card that fits only by its number and set size opens by itself when its picture is at most this far
// from the photo (gridDistance in matcher.js; the same limit as NUMBER_ALONE_MOST_DISTANCE for English
// cards, whose right cards scored 0.12 to 1.46, most under 1, and other cards mostly over 1.3): a misread
// number can fit a card that isn't the photo's. (On made-up photos, which are made from the very pictures
// compared, the right cards scored 0.27 at most: they can't say where the limit should be.)
const JAPANESE_LOOK_MOST_DISTANCE = 1.0;

// Reads a photo looked at already (lookAtPhoto in reader.js, which also turns a card lying sideways upright). Returns what readCardPhoto returns for a
// Pokémon card - { name, nameSure, number, numberGuesses, setCode, photo, textArea, cardBox, sparkle } -
// with no name, and setCode the set's id in TCGdex's Japanese database ("SV2a"), or "". Throws when
// TCGdex's list of sets can't be had. stillWanted: as for readCardPhoto.
async function readJapanesePhoto(seen, stillWanted = () => true) {
	let { original, photo, framed } = seen;
	try {
		const [worker, sets] = await Promise.all([getOcrWorker(), japaneseSets()]);
		stopUnlessWanted(stillWanted, original);
		// The card's box; failing that a box that may be the card's (checked by the number below), or the
		// whole photo as a guess.
		let cardBox = seen.cardBox || seen.doubtfulBox
			|| { x0: 0, x1: photo.width, y0: 0, y1: photo.height, foundBy: "whole photo, a guess" };
		let numberGuesses = await readJapaneseNumbers(worker, original, photo, cardBox, framed, stillWanted);
		if (!numberGuesses.some(isWholeNumber)) {
			// No number: perhaps the card is upside down (a card lying sideways may have been turned the wrong way,
			// see lookAtPhoto). Its other end is read, turned right way up.
			stopUnlessWanted(stillWanted, original);
			const turnedOriginal = await createImageBitmap(turnedPicture(original, 2));
			const turnedPhoto = turnedPicture(photo, 2);
			const turnedBox = boxTurnedOver(cardBox, photo);
			const again = await readJapaneseNumbers(worker, turnedOriginal, turnedPhoto, turnedBox, null, stillWanted);
			if (again.some(isWholeNumber)) {
				original.close();
				original = turnedOriginal;
				photo = turnedPhoto;
				cardBox = turnedBox;
				framed = null;
				numberGuesses = again;
			} else {
				turnedOriginal.close();
			}
		}
		// The set's code, for a number that was read whole (else nothing says which size it is of).
		let setCode = "";
		if (numberGuesses.length > 0 && isWholeNumber(numberGuesses[0])) {
			setCode = await readJapaneseSetCode(worker, original, scaleBox(cardBox, original.width / photo.width), sizeRead(numberGuesses), sets, stillWanted);
		}
		return {
			name: "",
			nameSure: false,
			number: numberGuesses[0] || "",
			numberGuesses: numberGuesses,
			setCode: setCode,
			photo: photo,
			textArea: null,
			cardBox: cardBox,
			sparkle: sparkleOf(photo, cardBox, null),
		};
	} finally {
		original.close();   // the full-size photo takes a lot of memory; it isn't needed any more
	}
}

// The numbers the card in this box (in the shrunk photo) may have, likeliest first, as readCollectorNumbers in
// reader.js gives them: read where the number is printed, in the ways of the Pokémon reader, and again from
// other cuts of the card when the first reads don't agree (see NUMBER_RECUTS); [] when the card is too small
// in the photo for its print to be read. framed: the camera's frame, another cut to try.
async function readJapaneseNumbers(worker, original, photo, cardBox, framed, stillWanted) {
	const bigEnough = (cardBox.y1 - cardBox.y0) * original.height / photo.height >= MIN_CARD_PIXELS_FOR_NUMBER;
	if (!bigEnough) return [];
	const otherCuts = cardBox === framed ? [] : [...NUMBER_RECUTS.map((recut) => recutBox(cardBox, recut)), ...(framed ? [framed] : [])];
	const placeGuesses = await readNumberPlacesOfCard(worker, original, photo, cardBox, otherCuts, stillWanted);
	if (twoReadsAgree(placeGuesses)) return likeliestNumbers(placeGuesses).slice(0, MAX_NUMBER_GUESSES);
	// Not sure: the card's lowest lines are read one at a time too (see readCollectorNumbers).
	stopUnlessWanted(stillWanted, original);
	const view = cardView(photo, cardBox);
	const page = await readPage(worker, view.picture, "scattered");
	return readCollectorNumbers(worker, original, photo, placeGuesses, page, view);
}

// The set's code printed in the corner (card is the card's box in the full-size original), in the ways of
// JAPANESE_CODE_READS, until one reads a code that fits (see japaneseSetCodeIn). Returns the set's id
// ("SV2a"), or "".
async function readJapaneseSetCode(worker, original, card, size, sets, stillWanted) {
	const width = card.x1 - card.x0;
	const height = card.y1 - card.y0;
	const area = {
		x0: card.x0 + width * JAPANESE_CODE_PLACE.x0,
		x1: card.x0 + width * JAPANESE_CODE_PLACE.x1,
		y0: card.y0 + height * JAPANESE_CODE_PLACE.y0,
		y1: card.y0 + height * JAPANESE_CODE_PLACE.y1,
	};
	for (const way of JAPANESE_CODE_READS) {
		stopUnlessWanted(stillWanted, original);
		const closeUp = cropAndZoom(original, area, way.cardWidth / width);
		const picture = way.ink ? inkAgainstBackground(closeUp, "soft", way.ink === "light") : closeUp;
		const read = await readPage(worker, picture, way.mode);
		const found = japaneseSetCodeIn(read.text, size, sets);
		if (found) return found;
	}
	return "";
}

// The set whose code is in this text read from the corner, as its id ("SV2a"), or "". A code may be read
// with a letter or two wrong (a tiny "S" for "5"), or stuck to the regulation mark before it ("Gsv2a"), so
// when the set's size is known the sets of that size are compared with every word; without it, only a
// code that is a set's exactly counts.
function japaneseSetCodeIn(text, size, sets) {
	const words = String(text || "").toUpperCase().split(/[^A-Z0-9-]+/).filter((word) => word.length >= 2);
	const parts = [];
	for (const word of words) {
		for (let start = 0; start <= Math.min(2, word.length - 2); start++) parts.push(word.slice(start));
	}
	for (const part of parts) {
		const exact = sets.byCode.get(part);
		if (exact && (size === null || exact.printedTotal === size)) return exact.id;
	}
	if (size === null) return "";
	// Else a code read with letters that look alike mixed up ("mIL" for "m1L"), or one letter wrong or lost,
	// among the sets of the size read: the best fit, when one set fits better than the others.
	let best = null;
	let tied = false;
	for (const part of parts) {
		const seen = lookalikeCode(part);
		for (const set of sets.byId.values()) {
			if (set.printedTotal !== size) continue;
			const shape = lookalikeCode(set.id);
			const mistakes = seen === shape ? 0 : (shape.length >= 4 ? editDistance(seen, shape, 1) : 2);
			if (mistakes > 1) continue;
			if (!best || mistakes < best.mistakes) {
				best = { id: set.id, mistakes: mistakes };
				tied = false;
			} else if (mistakes === best.mistakes && set.id !== best.id) {
				tied = true;
			}
		}
	}
	return best && !tied ? best.id : "";
}

// A code with the characters tiny print mixes up made alike: I, l, 1 and | ("m1L" is read "mIL"), O and 0,
// S and 5, B and 8, Z and 2, G and 6.
function lookalikeCode(code) {
	return code.toUpperCase().replace(/[IL1|!]/g, "1").replace(/[OQD0]/g, "0").replace(/[S5]/g, "5")
		.replace(/[B8]/g, "8").replace(/[Z2]/g, "2").replace(/[G6]/g, "6");
}

// Which of the cards found for a photo (see findJapaneseCards) it shows, from how much each looks like it
// (ranked: from rankByLook in matcher.js): what pickBestMatch in matcher.js decides with these clues -
// { cards, clear }. But a card that only its number and set size fit opens by itself only when its
// picture looks like the photo (JAPANESE_LOOK_MOST_DISTANCE); a card named by the set's code as well
// (found.exactFound) needs no picture, as many cards have none (see japanesePictures).
function pickJapaneseCard(ranked, found, clues = {}) {
	const pick = pickBestMatch(ranked, true, clues);
	const first = ranked.find((entry) => entry.card === pick.cards[0]);
	if (pick.clear && (found.exactFound || (first && first.distance <= JAPANESE_LOOK_MOST_DISTANCE))) return pick;
	// Not sure enough to open: listed with the cards the viewer showed the app before first, then those
	// that look like the photo, then those of the set the code read names - a card with no picture can't look
	// like anything, and the code is what says it may be the one - then the rest.
	const suggested = new Set(clues.suggestedIds || []);
	const codeSets = clues.codeSets || [];
	const order = [
		(entry) => suggested.has(entry.card.id),
		(entry) => entry.distance <= JAPANESE_LOOK_MOST_DISTANCE,
		(entry) => codeSets.includes(entry.card.set.id),
	];
	const cards = [];
	for (const wanted of [...order, () => true]) {
		for (const entry of ranked) {
			if (!cards.includes(entry.card) && wanted(entry)) cards.push(entry.card);
		}
	}
	return { cards: cards, clear: false };
}
