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
// Japanese cards print no number before Pokémon VS (July 2001): the 1996-99 sets and the Neo sets print none.
// TCGdex numbers their cards all the same, and its first set (PMCG1, 1996) has 102 cards, like the English Base
// Set - so a Base Set photo whose "102/102" was read seemed to fit a Japanese card (version 1.67.0's first try).
// A number read on a photo can't come from a card of those sets (see printsItsNumber).
const JAPANESE_NUMBERS_PRINTED_FROM = "2001-07-01";

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

// With Pokémon picked, a photo is read as an English card (readCardPhoto in reader.js), and a Japanese card is
// found without picking Japanese (asked for in version 1.67.0). The reader knows English only, so a Japanese
// card's name can't be read, and what the English search finds for it (findCards in cards.js) is a card with the
// number read and a picture like it - at best the English print of the same card: many sets are printed in both
// languages with the same numbers and pictures (the 151 set is SV2a in Japanese, Shrouded Fable SV6a, White Flare
// SV11W). So unless the English search found the card by its name and its number, the photo is read as a
// Japanese card too (japaneseCardOfPhoto). found: what findCards gave.
function mayBeJapanese(found) {
	return !found.exactFound && !found.learned;
}

// A card found by its number alone (cardByNumberAlone in matcher.js) opens before its name is read. But when a
// Japanese card has the same number in a set of the same size and looks as much like the photo - the same card
// printed in Japanese, as above - the photo may be of that one, so the English card opens only when the name
// strip reads its English name. (Stellar Miracle, SV7 in Japanese, has 102 cards like the English Base Set, but
// other pictures: Base Set cards still open by their number - but for Water Energy 102/102, which the picture
// comparison finds about as like SV7's blue cave Stadium 102/102, 1.08 against 0.98 on a real photo.)
// sure: what reader.js gives onSureNumber; cards: what cardByNumberAlone found, the one it opens first.
// When the Japanese database doesn't answer, the English card opens, as before 1.67.0.
async function englishCardIsSure(sure, cards) {
	const card = cards[0];
	if (!sure.readName || !/^\d+$/.test(card.number) || !card.set.printedTotal) return true;
	let found;
	try {
		found = await findJapaneseCards("", card.number + "/" + card.set.printedTotal, true, []);
	} catch (error) {
		return true;
	}
	// (The search also gives cards with that number in sets of other sizes when none fits: they don't count.)
	const twins = found.cards.filter((each) => sameNumber(each.number, card.number) && each.set.printedTotal === card.set.printedTotal && printsItsNumber(each));
	if (twins.length === 0) return true;
	const ranked = await rankByLook(sure.photo, null, [card, ...twins], sure.cardBox);
	const english = ranked.find((entry) => entry.card === card);
	if (japaneseLookAlikes(ranked.filter((entry) => entry !== english), english.distance).length === 0) return true;
	const name = await sure.readName();
	return Boolean(name) && longestWord(name.text).toLowerCase() === longestWord(card.name).toLowerCase();
}

// The photo read as a Japanese card (see readJapanesePhoto), for a photo mayBeJapanese said may be of one:
// { reading, shown, found, ranked, pick }, ranked the cards found by how much they look like the photo (see
// rankByLook), pick.clear when a Japanese card opens by itself (see pickJapaneseCard), and
// found.cards empty when no Japanese card has the number read; null when no number was read. shown is what goes in
// the number box ("SV2a 151/165"). The Japanese database is asked whatever the search language is
// (setCardSearchLanguage in cards.js). frame and stillWanted: as for readCardPhoto. otherNumbers: the numbers the
// English reading read: they count too, as the two readings find the card's edges in their own ways, and one can
// read the number where the other doesn't (made-up photos of a White Flare and a Heatmor card).
async function japaneseCardOfPhoto(imageFile, frame = null, stillWanted = () => true, otherNumbers = []) {
	const look = await lookAtPhoto(imageFile, frame, null, true);
	const reading = await readJapanesePhoto(look, stillWanted);
	reading.numberGuesses = [...new Set([...reading.numberGuesses, ...otherNumbers.filter(Boolean)])];
	reading.number = reading.number || reading.numberGuesses[0] || "";
	if (!reading.number) return null;
	const shown = [reading.setCode, reading.number].filter(Boolean).join(" ");
	const found = await findJapaneseCards("", shown, true, reading.numberGuesses);
	if (!stillWanted()) return null;
	let ranked = [];
	let pick = { cards: [], clear: false };
	if (found.cards.length > 0) {
		ranked = await rankByLook(reading.photo, null, found.cards, reading.cardBox);
		pick = pickJapaneseCard(ranked, found, { setSizes: found.setSizes, codeSets: reading.setCode ? [reading.setCode] : [], numbersRead: found.numbersRead });
	}
	return { reading: reading, shown: shown, found: found, ranked: ranked, pick: pick };
}

// True when the photo is of an English card after all, though a Japanese card opens by itself for it
// (japanese.pick.clear; japanese: what japaneseCardOfPhoto gave): an English card with the name the English
// reading read (name) looks about as much like the photo as that Japanese card - the English print of the same
// card, as a Japanese name can't be read in English. (A made-up photo of the English Bulbasaur 001/132, its
// number read "1/112", opened the Japanese Bulbasaur 001/063 of Mega Brave, with the very same picture.) A chance
// name read on a Japanese card ("Natu" on a Kilowattrel ex) finds English cards that look nothing like it.
// "About as much": within SET_SIZE_LOOK_SLACK of the Japanese card, or at most JAPANESE_LOOK_MOST_DISTANCE, as
// the two are compared on photos cut out by two readings, and a ratio of two tiny distances says little.
// cards: what the English search found (findCards in cards.js); photo, textArea, cardBox: as for rankByLook.
async function englishNameWins(japanese, name, cards, photo, textArea, cardBox) {
	const word = longestWord(name).toLowerCase();
	const named = cards.filter((card) => word !== "" && longestWord(card.name).toLowerCase() === word);
	if (named.length === 0) return false;
	const ranked = await rankByLook(photo, textArea, named, cardBox);
	const japaneseCard = japanese.ranked.find((entry) => entry.card === japanese.pick.cards[0]);
	return ranked[0].distance <= Math.max(japaneseCard.distance * SET_SIZE_LOOK_SLACK, JAPANESE_LOOK_MOST_DISTANCE);
}

// True when an English card the search found for a photo must not open by itself with Pokémon picked: the photo
// was read as a Japanese card too (japanese: what japaneseCardOfPhoto gave, or null), and the English card that
// would open looks little like it, or a Japanese card with the number and set size read looks as much like it
// (englishDistance: how far that English card is from the photo, see rankByLook). The photo may be of that
// Japanese card - and the English card then the English print of the same card, or one that only looks somewhat
// like it. The cards are listed to pick from instead.
function japaneseDoubt(japanese, englishDistance) {
	if (japanese === null) return false;
	// A number misread fits English cards too, and with no name read (a Japanese name can't be) a card the search
	// finds alone opens however little it looks like the photo: a Japanese Heatran 007/50 read "15/20" opened
	// Dragon Vault's Fraxure 15/20, 1.75 from the photo. The right English cards of photos read as Japanese too
	// scored at most 0.98 (dev_real_photos_test.html).
	if (englishDistance > LOOK_ALIKE_MOST_DISTANCE) return true;
	return japaneseLookAlikes(japaneseCardsThatFit(japanese), englishDistance).length > 0;
}

// The Japanese cards found for a photo read as one (japanese: what japaneseCardOfPhoto gave), as rankByLook ranked
// them, that have the number and set size read, of a set that prints its numbers (see printsItsNumber).
function japaneseCardsThatFit(japanese) {
	// Only cards with the number in a set of the size read count: when none has it, the search gives cards with
	// that number in sets of other sizes, which any number fits.
	const sizes = japanese.found.setSizes || [];
	return japanese.ranked.filter((entry) => sizes.includes(String(entry.card.set.printedTotal)) && printsItsNumber(entry.card));
}

// The Japanese cards (ranked by rankByLook) the photo may be of, next to an English card this far from it: one
// with no picture can't be told apart, and one with a picture can when it looks clearly less like the photo -
// cards with the very same picture score within about 1.13 of each other, a different card at least twice as
// far (SET_SIZE_LOOK_SLACK in matcher.js).
function japaneseLookAlikes(ranked, englishDistance) {
	return ranked.filter((entry) => entry.distance === Infinity || entry.distance <= englishDistance * SET_SIZE_LOOK_SLACK);
}

// False for a Japanese card of a set that prints no number (see JAPANESE_NUMBERS_PRINTED_FROM), so a number
// read on a photo can't be its. A set with no release date in japanese-sets.js counts as printing one.
function printsItsNumber(card) {
	return !card.set.releaseDate || card.set.releaseDate >= JAPANESE_NUMBERS_PRINTED_FROM;
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
