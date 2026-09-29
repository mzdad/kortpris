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

// Reads a photo looked at already (lookAtPhoto in reader.js). Returns what readCardPhoto returns for a
// Pokémon card - { name, nameSure, number, numberGuesses, setCode, photo, textArea, cardBox, sparkle } -
// with no name, and setCode the set's id in TCGdex's Japanese database ("SV2a"), or "". Throws when
// TCGdex's list of sets can't be had. stillWanted: as for readCardPhoto.
async function readJapanesePhoto(seen, stillWanted = () => true) {
	const { original, photo, framed } = seen;
	try {
		const [worker, sets] = await Promise.all([getOcrWorker(), japaneseSets()]);
		stopUnlessWanted(stillWanted, original);
		// The card's box; failing that a box that may be the card's (checked by the number below), or the
		// whole photo as a guess.
		const cardBox = seen.cardBox || seen.doubtfulBox
			|| { x0: 0, x1: photo.width, y0: 0, y1: photo.height, foundBy: "whole photo, a guess" };
		const cardInOriginal = scaleBox(cardBox, original.width / photo.width);
		const bigEnough = (cardBox.y1 - cardBox.y0) * original.height / photo.height >= MIN_CARD_PIXELS_FOR_NUMBER;
		let numberGuesses = [];
		if (bigEnough) {
			// The number where it is printed, in the ways of the Pokémon reader; other cuts of the card when the
			// first reads don't agree (see NUMBER_RECUTS).
			const otherCuts = cardBox === framed ? [] : [...NUMBER_RECUTS.map((recut) => recutBox(cardBox, recut)), ...(framed ? [framed] : [])];
			const placeGuesses = await readNumberPlacesOfCard(worker, original, photo, cardBox, otherCuts, stillWanted);
			if (twoReadsAgree(placeGuesses)) {
				numberGuesses = likeliestNumbers(placeGuesses).slice(0, MAX_NUMBER_GUESSES);
			} else {
				// Not sure: the card's lowest lines are read one at a time too (see readCollectorNumbers).
				stopUnlessWanted(stillWanted, original);
				const view = cardView(photo, cardBox);
				const page = await readPage(worker, view.picture, "scattered");
				numberGuesses = await readCollectorNumbers(worker, original, photo, placeGuesses, page, view);
			}
		}
		// The set's code, for a number that was read whole (else nothing says which size it is of).
		let setCode = "";
		if (numberGuesses.length > 0 && isWholeNumber(numberGuesses[0])) {
			setCode = await readJapaneseSetCode(worker, original, cardInOriginal, sizeRead(numberGuesses), sets, stillWanted);
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
	let best = null;
	for (const word of words) {
		for (let start = 0; start <= Math.min(2, word.length - 2); start++) {
			const part = word.slice(start);
			const exact = sets.byCode.get(part);
			if (exact && (size === null || exact.printedTotal === size)) return exact.id;
			if (size === null || part.length < 4) continue;
			for (const set of sets.byId.values()) {
				if (set.printedTotal !== size || set.id.length < 4) continue;
				const mistakes = editDistance(part, set.id.toUpperCase(), 1);
				if (mistakes <= 1 && (!best || mistakes < best.mistakes)) best = { id: set.id, mistakes: mistakes };
			}
		}
	}
	return best ? best.id : "";
}

// Which of the cards found for a photo (see findJapaneseCards) it shows, from how much each looks like it
// (ranked: from rankByLook in matcher.js): what pickBestMatch in matcher.js decides with these clues -
// { cards, clear }. But a card that only its number and set size fit opens by itself only when its
// picture looks like the photo (JAPANESE_LOOK_MOST_DISTANCE); a card named by the set's code as well
// (found.exactFound) needs no picture, as many cards have none (see japanesePictures).
function pickJapaneseCard(ranked, found, clues = {}) {
	const pick = pickBestMatch(ranked, true, clues);
	if (!pick.clear || found.exactFound) return pick;
	const first = ranked.find((entry) => entry.card === pick.cards[0]);
	return { cards: pick.cards, clear: first.distance <= JAPANESE_LOOK_MOST_DISTANCE };
}
