"use strict";

// Reads a photo of a Magic: The Gathering card (roadmap 7.2): the name printed along its top, and on
// cards from 2014 on the number, set code and language printed in its bottom-left corner ("246/297 R"
// over "SOI • EN"), which name the one printing. Cards from 1998 to 2014 print only a number and their
// set's size, at the end of the bottom line ("28/350"), and older cards nothing but their name: there
// the card's picture picks the printing (rankByLook in matcher.js), as it does for Pokémon cards.
// It uses the text reader and the card finder of Pokémon cards (reader.js, card-finder.js), with
// Magic's own places on the card, and Magic's card names from Scryfall (magic.js).
// dev_magic_photos_test.html measures how well this works - run it after every change here.

// Where the name is printed, as shares of the card's width and height: left of the mana cost, along
// the top. It starts a little above the card's box: on a white-bordered card on a light table, the
// card finder often finds the edge inside the white border (see card-finder.js), and the name then sits
// higher in the box.
const MAGIC_NAME_STRIP = { x0: 0.04, x1: 0.84, y0: -0.01, y1: 0.12 };
// Ways of reading the name strip, in turn, until one finds a card's name. cardWidth: how wide the whole
// card is at that enlargement, in pixels. ink: "light" for a copy of only the light print, "dark" for
// only the dark print, "" for the photo itself (see inkAgainstBackground in reader.js). On 32 real
// photos (version 1.57.0) the first way read 13 names; the light one reads the white names of older
// cards, which the others can't see on their textured frames; the smaller and bigger ones each read a
// few more. (Letters much taller than 40 pixels read worse: at 2,000 pixels wide, 13 names fewer.)
const MAGIC_NAME_READS = [
	{ cardWidth: 1000, ink: "", mode: "block" },
	{ cardWidth: 1000, ink: "light", mode: "ink" },
	{ cardWidth: 1000, ink: "dark", mode: "ink" },
	{ cardWidth: 1400, ink: "", mode: "block" },
	{ cardWidth: 700, ink: "", mode: "block" },
];
// When no way finds a name, the card may be upside down: the other end of the card is read in the first
// this many ways, turned the right way up.
const UPSIDE_DOWN_READS = 2;
// A name's letters are at least this tall, as a share of the card's height (they are about 3%): smaller
// text in the strip is a bit of the picture or the frame, not the name.
const MAGIC_NAME_MIN_HEIGHT = 0.015;
// A name counts when at most this many of its letters were misread: none for names shorter than 4
// letters, one up to 6 letters, and one in four for longer ones ("Sixalted Anoel" is Exalted Angel; see
// allowedNameMistakes). A name whose end the reader lost ("Invocation of Sai") counts when at least this
// share of it was read, and the loss counts as one mistake.
const MAGIC_PARTIAL_NAME_SHARE = 0.6;
// Words read only faintly (Tesseract's 0 to 100) are made up from the frame or the picture as often as
// not: a name must have at least one word read at least this surely - unless it was read exactly and has
// at least this many letters (see closestMagicName).
const MAGIC_NAME_WORD_CONFIDENCE = 55;
const MAGIC_EXACT_NAME_LETTERS = 10;
// A name shorter than this is only sure when it was read exactly, and all its words at least this surely
// (see closestMagicName).
const MAGIC_LONG_NAME_LETTERS = 7;
const MAGIC_SHORT_NAME_CONFIDENCE = 60;
// Two ways of reading that find the same name make it sure, when it has at least this many letters
// (see readMagicName).
const MAGIC_AGREED_NAME_LETTERS = 5;
// Ways of reading the bottom corners, in turn, until one finds the card's number (and set code).
// The corner is printed white on a black border, so the light print is read first.
const MAGIC_CORNER_READS = [
	{ cardWidth: 2500, ink: "light", mode: "ink" },
	{ cardWidth: 2500, ink: "", mode: "block" },
	{ cardWidth: 2000, ink: "dark", mode: "ink" },
];
// Where cards from 2014 on print their number, rarity, set code and language: two short lines in the
// bottom-left corner. And where cards from 1998 to 2014 print their number and set size: at the end of
// the bottom line, by the copyright.
const MAGIC_CORNER_LEFT = { x0: 0.02, x1: 0.45, y0: 0.925, y1: 0.995 };
const MAGIC_CORNER_RIGHT = { x0: 0.5, x1: 0.98, y0: 0.925, y1: 0.995 };
// What tiny capitals in a set code are misread as, both ways ("SOT" is SOI, "DDG" is DDQ, "ARH" is AKH).
const CODE_LOOKALIKES = ["IT1L", "O0DQUCG", "HKN", "S5", "B8", "Z2", "EF", "MN", "VY", "RK"];
// At most this many printings of a name are compared with the photo: the newest ones, as Scryfall
// lists them newest first. (Basic lands have 750 each: for them, the corner has to say which.)
const MOST_MAGIC_PRINTINGS = 100;
// A card found by its name alone opens by itself only when its picture is at most this far from the
// photo (gridDistance in matcher.js; see pickMagicCard).
const MAGIC_LOOK_MOST_DISTANCE = 1.5;
// When what was read fits several names just as well ("Breeding" is the start of Breeding Pit and
// Breeding Pool), the printings of at most this many more are compared with the photo too.
const MOST_OTHER_NAMES = 2;
// Sets printed only in other languages - German, French and Italian cards with black borders from 1994 and
// 1995, which Scryfall lists under their English names, with the same pictures as the English ones: a
// card whose English name was read isn't from them.
const FOREIGN_ONLY_SETS = ["4bb", "fbb", "ren", "rin", "bchr"];

let magicNamesPromise = null;

// ---------- Where the card is ----------

// Where the card is in the photo, before any text is read: what lookAtPhoto in reader.js gives for a
// Pokémon card - { original, photo, framed, cardBox, doubtfulBox } - plus turns: how many quarter
// turns clockwise the photo was given, so that the card stands upright in it (0 or 1). A card lying
// sideways is found in the photo turned: then it is the biggest card-shaped box, where upright only a
// part of it has a card's shape (its picture, or its text box). frame: as for readCardPhoto.
async function lookAtMagicPhoto(imageFile, frame = null) {
	const original = await createImageBitmap(imageFile);
	const photo = shrinkPhoto(original);
	const framed = frame ? frameBoxIn(photo, frame) : null;
	// In the app's own camera, the card is held upright in the white frame.
	if (framed) {
		const found = findCardByShape(photo);
		return { original, photo, framed, cardBox: found && fitsFrame(found, framed) ? found : framed, doubtfulBox: null, turns: 0 };
	}
	const upright = findCardByShape(photo) || wholePhotoCard(photo);
	const turnedPhoto = turnedPicture(photo, 1);
	const sideways = findCardByShape(turnedPhoto);
	if (sideways && boxArea(sideways) > boxArea(upright)) {
		const turnedOriginal = await createImageBitmap(turnedPicture(original, 1));
		original.close();
		return { original: turnedOriginal, photo: turnedPhoto, framed: null, cardBox: sideways, doubtfulBox: null, turns: 1 };
	}
	// A box that may only be the card's (see MIN_DOUBTFUL_SHAPE_SCORE) is taken all the same: the name
	// read where the box says it is printed checks it (see readMagicPhoto). Without any, the card may
	// fill the photo, or reach past its edge.
	const cardBox = upright || findCardAtPhotoEdge(photo);
	return { original, photo, framed: null, cardBox, doubtfulBox: null, turns: 0 };
}

function boxArea(box) {
	return box ? (box.x1 - box.x0) * (box.y1 - box.y0) : 0;
}

// A copy of a picture given this many quarter turns clockwise.
function turnedPicture(picture, turns) {
	const sideways = turns % 2 === 1;
	const turned = document.createElement("canvas");
	turned.width = sideways ? picture.height : picture.width;
	turned.height = sideways ? picture.width : picture.height;
	const ctx = turned.getContext("2d", { willReadFrequently: true });   // same on every PC (see shrinkPhoto)
	ctx.translate(turned.width / 2, turned.height / 2);
	ctx.rotate(turns * Math.PI / 2);
	ctx.drawImage(picture, -picture.width / 2, -picture.height / 2);
	return turned;
}

// A box in a picture, where it is once the picture is turned half round.
function boxTurnedOver(box, picture) {
	return { ...box, x0: picture.width - box.x1, x1: picture.width - box.x0, y0: picture.height - box.y1, y1: picture.height - box.y0 };
}

// ---------- Reading it ----------

// Reads a photo looked at already (see lookAtMagicPhoto). Returns what readCardPhoto in reader.js
// returns for a Pokémon card - { name, nameSure, number, numberGuesses, setCode, photo, textArea,
// cardBox, sparkle } - where number is what a viewer would type for the card's corner ("SOI 246", or
// "28" when no set code is printed), and setCode the set's code in Scryfall's small letters ("soi");
// plus otherNames: names that fit what was read just as well as name (see closestMagicName).
// Throws when Scryfall's list of names can't be had (the reading can't tell a name from a smudge
// without it). stillWanted: as for readCardPhoto.
async function readMagicPhoto(seen, stillWanted = () => true) {
	let { original, photo, cardBox } = seen;
	try {
		const [worker, names] = await Promise.all([getOcrWorker(), magicNameList()]);
		stopUnlessWanted(stillWanted, original);
		if (!cardBox) {
			// The card wasn't found: the whole photo is read as if it were the card.
			cardBox = { x0: 0, x1: photo.width, y0: 0, y1: photo.height, foundBy: "whole photo, a guess" };
		}
		let card = scaleBox(cardBox, original.width / photo.width);
		let name = await readMagicName(worker, original, card, names, stillWanted, MAGIC_NAME_READS);
		if (!name.sure) {
			// Maybe upside down: its name is then at the other end, turned round.
			const turnedOriginal = await createImageBitmap(turnedPicture(original, 2));
			const turnedCard = boxTurnedOver(card, original);
			const turnedName = await readMagicName(worker, turnedOriginal, turnedCard, names, stillWanted,
				MAGIC_NAME_READS.slice(0, UPSIDE_DOWN_READS));
			if (turnedName.sure) {
				original.close();
				original = turnedOriginal;
				card = turnedCard;
				cardBox = boxTurnedOver(cardBox, photo);
				photo = turnedPicture(photo, 2);
				name = turnedName;
			} else {
				turnedOriginal.close();
			}
		}
		stopUnlessWanted(stillWanted, original);
		const corner = await readMagicCorners(worker, original, card, stillWanted);
		const number = corner.number ? [corner.setCode.toUpperCase(), corner.number].filter(Boolean).join(" ") : "";
		return {
			name: name.name,
			nameSure: name.sure,
			otherNames: name.others,
			number: number,
			numberGuesses: [],
			setCode: corner.setCode,
			photo: photo,
			textArea: null,
			cardBox: cardBox,
			sparkle: null,
		};
	} finally {
		original.close();   // the full-size photo takes a lot of memory; it isn't needed any more
	}
}

// ---------- The name ----------

// Every Magic card's name - each face of a two-faced card on its own ("Fire // Ice" is Fire and Ice) -
// as Map(number of letters -> [{ name, key }]), key being its plain letters (see lettersOnly in
// reader.js). From Scryfall's list of all of them, about 36,000 (catalog/card-names), asked at the first
// Magic photo and kept a day like any Scryfall answer (see askScryfall in magic.js).
function magicNameList() {
	if (!magicNamesPromise) {
		magicNamesPromise = askScryfall(SCRYFALL_API + "/catalog/card-names").then((answer) => {
			const byLetters = new Map();
			const known = new Set();
			for (const fullName of answer.data || []) {
				for (const name of fullName.split(" // ")) {
					const key = lettersOnly(name);
					if (!key || known.has(key)) continue;
					known.add(key);
					if (!byLetters.has(key.length)) byLetters.set(key.length, []);
					byLetters.get(key.length).push({ name: name, key: key });
				}
			}
			if (byLetters.size === 0) throw new Error("Scryfall sent no card names");
			return byLetters;
		});
		magicNamesPromise.catch(() => { magicNamesPromise = null; });   // asked again at the next photo
	}
	return magicNamesPromise;
}

// Reads the name strip (card is the card's box in the full-size original) in each of these ways, in
// turn, until one finds a card's name sure. Returns { name, others, sure }: the surest name found - sure
// when one way read it sure, or two ways read the same name - and the names that fit that read just as
// well (see closestMagicName), or { name: "", others: [], sure: false }.
async function readMagicName(worker, original, card, names, stillWanted, ways) {
	const cardWidth = card.x1 - card.x0;
	const cardHeight = card.y1 - card.y0;
	const area = {
		x0: card.x0 + cardWidth * MAGIC_NAME_STRIP.x0,
		x1: card.x0 + cardWidth * MAGIC_NAME_STRIP.x1,
		y0: card.y0 + cardHeight * MAGIC_NAME_STRIP.y0,
		y1: card.y0 + cardHeight * MAGIC_NAME_STRIP.y1,
	};
	const found = [];
	for (const way of ways) {
		stopUnlessWanted(stillWanted, original);
		const zoom = way.cardWidth / cardWidth;
		const closeUp = cropAndZoom(original, area, zoom);
		const picture = way.ink ? inkAgainstBackground(closeUp, "soft", way.ink === "light") : closeUp;
		const read = await readPage(worker, picture, way.mode);
		const name = closestMagicName(read.lines, names, cardHeight * zoom * MAGIC_NAME_MIN_HEIGHT);
		if (!name) continue;
		if (name.sure) return { name: name.name, others: name.others, sure: true };
		// Two ways reading the same name, each with its own mistakes, make it sure - unless it is a very short
		// one, which the same smudge can make up twice.
		const agreed = found.some((earlier) => earlier.name === name.name);
		if (agreed && lettersOnly(name.name).length >= MAGIC_AGREED_NAME_LETTERS) return { name: name.name, others: [], sure: true };
		found.push(name);
	}
	found.sort((a, b) => a.mistakes - b.mistakes);
	return found.length > 0 ? { name: found[0].name, others: found[0].others, sure: false } : { name: "", others: [], sure: false };
}

// The card names that best fit the lines read: every run of words on each line is compared with every
// name about as long (see magicNameList). Returns { name, others, mistakes, sure } for the best fit - others
// being the names that fit just as well ("Breeding" is the start of Breeding Pit and Breeding Pool) - or
// null when none fits. Only runs with a clearly read word count (MAGIC_NAME_WORD_CONFIDENCE), and lines
// with letters smaller than smallestName (in pixels) are left out.
function closestMagicName(lines, names, smallestName = 0) {
	let best = null;
	for (const line of lines) {
		if (line.bbox.y1 - line.bbox.y0 < smallestName) continue;
		const words = (line.words || [])
			.map((word) => ({ text: word.text.replace(/[^A-Za-z',-]/g, ""), confidence: word.confidence }))
			.filter((word) => lettersOnly(word.text).length > 0);
		for (let start = 0; start < words.length; start++) {
			for (let end = start + 1; end <= Math.min(words.length, start + MAX_NAME_WORDS); end++) {
				const run = words.slice(start, end);
				const key = lettersOnly(run.map((word) => word.text).join(""));
				if (key.length < 3) continue;
				const fits = bestNamesFor(key, names);
				if (fits.length === 0) continue;
				const { mistakes } = fits[0];
				// Faint words only count when they spell a long name exactly, which no smudge does by
				// chance: Tesseract gave "Snow Covered Swamp", read right, 0, 0 and 16.
				const clear = Math.max(...run.map((word) => word.confidence)) >= MAGIC_NAME_WORD_CONFIDENCE;
				if (!clear && (mistakes > 0 || key.length < MAGIC_EXACT_NAME_LETTERS)) continue;
				// A short name is sure only when read exactly and clearly: bits of a picture or frame are
				// easily read as "Fear" or "Pain", which are cards too - or a letter off ("Tervor").
				const confidence = Math.min(...run.map((word) => word.confidence));
				const sure = fits[0].key.length >= MAGIC_LONG_NAME_LETTERS
					|| (mistakes === 0 && confidence >= MAGIC_SHORT_NAME_CONFIDENCE);
				const candidate = { names: fits.map((fit) => fit.name), mistakes: mistakes, score: key.length - 2 * mistakes, sure: sure };
				if (!best || betterName(candidate, best)) best = candidate;
			}
		}
	}
	if (!best) return null;
	return { name: best.names[0], others: best.names.slice(1), mistakes: best.mistakes, sure: best.sure };
}

// Sure first, then the one that explains the most letters read: each mistake counts against it twice
// ("Reckless Scho" is Reckless Scholar with one mistake, the lost end, which beats "Reckless" alone,
// the start of Reckless Blaze).
function betterName(a, b) {
	if (a.sure !== b.sure) return a.sure;
	return a.score > b.score;
}

// The names that best fit these letters, each { name, key, mistakes }: those with the fewest
// mistakes, or [] when none is close enough (see allowedNameMistakes). A name is tried whole, and with
// its end lost (see MAGIC_PARTIAL_NAME_SHARE): a long name can run into the mana cost. Not with its start
// lost: names start at the card's left edge, and a word read on its own is often the end of some other
// card's name ("Invocation", of Devout Invocation).
function bestNamesFor(key, names) {
	let best = [];
	const allowed = allowedNameMistakes(key.length);
	// Only a start of at least MAGIC_LONG_NAME_LETTERS letters counts: "Knioht" isn't enough of Knighthood.
	const cutOff = key.length >= MAGIC_LONG_NAME_LETTERS;
	const longest = cutOff ? Math.floor(key.length / MAGIC_PARTIAL_NAME_SHARE) : key.length + allowed;
	for (let letters = key.length - allowed; letters <= Math.max(longest, key.length + allowed); letters++) {
		for (const entry of names.get(letters) || []) {
			const limit = allowedNameMistakes(entry.key.length);
			let mistakes = entry.key === key ? 0 : editDistance(key, entry.key, limit);
			if (cutOff && entry.key.length > key.length && key.length >= entry.key.length * MAGIC_PARTIAL_NAME_SHARE) {
				// The lost end counts as one mistake.
				const misread = editDistance(key, entry.key.slice(0, key.length), allowed);
				if (misread <= allowed) mistakes = Math.min(mistakes, misread + 1);
			}
			if (mistakes > limit) continue;
			if (best.length === 0 || mistakes < best[0].mistakes) best = [];
			if (best.length === 0 || mistakes === best[0].mistakes) best.push({ name: entry.name, key: entry.key, mistakes: mistakes });
		}
	}
	return best;
}

function allowedNameMistakes(letters) {
	if (letters < 4) return 0;
	if (letters < MAGIC_LONG_NAME_LETTERS) return 1;
	return Math.floor(letters / 4);
}

// ---------- The corner ----------

// Reads the bottom corners (card is the card's box in the full-size original): the left one first, for
// the number and set code of cards from 2014 on; the right one when it holds no number, for older cards'
// number and set size. Each in the ways of MAGIC_CORNER_READS until one reads a number. Returns
// { setCode, number }: the set's code in Scryfall's small letters when it was read ("soi"), or "", and
// the card's number without zeros in front ("82"), or "".
async function readMagicCorners(worker, original, card, stillWanted) {
	for (const place of [MAGIC_CORNER_LEFT, MAGIC_CORNER_RIGHT]) {
		let numberOnly = null;
		for (const way of MAGIC_CORNER_READS) {
			stopUnlessWanted(stillWanted, original);
			const closeUp = cutFromCard(original, card, place, way.cardWidth);
			const picture = way.ink ? inkAgainstBackground(closeUp, "soft", way.ink === "light") : closeUp;
			const read = await readPage(worker, picture, way.mode);
			const facts = magicCornerFacts(read.text);
			if (facts.setCode && facts.number) return facts;
			// A number without a set code is kept, while another way may still read the code too.
			if (facts.number && !numberOnly) numberOnly = facts;
			if (numberOnly && place === MAGIC_CORNER_RIGHT) break;
		}
		if (numberOnly) return numberOnly;
	}
	return { setCode: "", number: "" };
}

// A part of the card (place: shares of its width and height), cut from the full-size original and
// enlarged to the card being cardWidth pixels wide.
function cutFromCard(original, card, place, cardWidth) {
	const width = card.x1 - card.x0;
	const height = card.y1 - card.y0;
	const area = {
		x0: card.x0 + width * place.x0,
		x1: card.x0 + width * place.x1,
		y0: card.y0 + height * place.y0,
		y1: card.y0 + height * place.y1,
	};
	return cropAndZoom(original, area, cardWidth / width);
}

// The number and set code in the text read from a corner: { setCode, number }, each "" when not read.
// The number is the one before a "/" and the set's size ("082/297", "28/350"), or else one printed with
// zeros in front, as cards from 2014 on print it: "0146" from 2023 on, which prints no set size, and
// "051" of a "051/297" whose "/297" wasn't read. The set code is the three to five letters and digits
// before the language, "EN" - whatever the dot between them was read as ("SOT CEN", "ORI*EN", "KLD « EN")
// - made a real set's code (see realSetCode).
function magicCornerFacts(text) {
	let number = "";
	let size = 0;
	const numbered = text.match(/(?<!\d)(\d{1,4})\s*\/\s*(\d{2,4})(?!\d)/);
	if (numbered) {
		number = String(Number(numbered[1]));
		size = Number(numbered[2]);
		if (Number(number) === 0 || Number(number) > size * 2) number = "";   // a misread
	} else {
		const padded = text.match(/(?<![\d\/])0(\d{2,3})(?![\d\/])/);
		if (padded && Number(padded[1]) > 0) number = String(Number(padded[1]));
	}
	let setCode = "";
	const tokens = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
	for (let i = 1; i < tokens.length; i++) {
		// "EN", with the dot before it sometimes read as a letter stuck to it ("CEN").
		if (!/^[A-Za-z]?EN$/.test(tokens[i])) continue;
		const code = realSetCode(tokens[i - 1], size);
		if (code) setCode = code;
	}
	return { setCode: number ? setCode : "", number: number };
}

// The real set code (see magic-sets.js) that a code read may be: itself when it is one - and fits the
// set size read, when there is one - or else the one set whose code differs by a misread letter or
// two (see CODE_LOOKALIKES) and is of that size. "" when there is none, or several.
function realSetCode(read, size) {
	const code = read.toLowerCase();
	if (!/^[a-z0-9]{2,6}$/.test(code)) return "";
	const fits = (candidate) => MAGIC_SET_SIZES[candidate] !== undefined && (!size || MAGIC_SET_SIZES[candidate] === size);
	if (fits(code)) return code;
	if (!size) return "";   // without the size, a lookalike code could be any of several sets
	const likely = Object.keys(MAGIC_SET_SIZES).filter((candidate) => fits(candidate) && codesLookAlike(code, candidate));
	return likely.length === 1 ? likely[0] : "";
}

// True when two set codes differ only by letters that look alike when tiny (see CODE_LOOKALIKES), or
// by one letter lost ("so" for "soi").
function codesLookAlike(read, code) {
	if (read.length === code.length - 1) return code.startsWith(read) || code.endsWith(read);
	if (read.length !== code.length) return false;
	let differences = 0;
	for (let i = 0; i < code.length; i++) {
		if (read[i] === code[i]) continue;
		const alike = CODE_LOOKALIKES.some((group) => group.includes(read[i].toUpperCase()) && group.includes(code[i].toUpperCase()));
		if (!alike) return false;
		differences++;
	}
	return differences <= 2;
}

// ---------- Which card it is ----------

// The cards a photo of a Magic card may show, from what was read on it (see readMagicPhoto): what
// findMagicCards in magic.js returns - { cards, description, totalCount, exactFound, fixedName } - plus
// byCorner, true when the corner named the card; for the photo to pick from by the looks when there are
// several (see searchForCard in app.js). The set code and number read in the corner (numberText, "SOI
// 246") name one printing, and the name read its printings - with the printings of otherNames, the names
// that fit what was read just as well:
// - the corner's card, when it has one of those names, or nothing but the corner was read;
// - else the printings with the number read, when there are any;
// - else all the printings (the newest MOST_MAGIC_PRINTINGS of each name), and the corner's card too: one
//   of the two was misread, and the photo's looks decide which.
// Throws when Scryfall doesn't answer.
async function findMagicCardsOfPhoto(name, numberText, otherNames = []) {
	const wanted = name.replace(/["“”]/g, "").trim();
	const { setCode, number } = parseMagicNumber(numberText);
	const shown = [setCode.toUpperCase(), number].filter(Boolean).join(" ");
	const nothing = { cards: [], description: null, totalCount: 0, exactFound: false, fixedName: null, byCorner: false };
	// exactFound (as findCards in cards.js means it: the card is known for sure) only when the corner named
	// it: then learned cards the photo looks somewhat like aren't compared too (see withLearnedSuggestions).
	const found = (cards, key, values, byCorner = false) => ({
		cards: cards, description: { key: key, values: values }, totalCount: cards.length, exactFound: byCorner, fixedName: null, byCorner: byCorner,
	});
	const corner = setCode && number ? (await magicSearch("set:" + setCode + " cn:" + number)).cards : [];
	if (!wanted) return corner.length > 0 ? found(corner, "magicSetNumber", { number: shown }, true) : nothing;
	const names = [wanted, ...otherNames.slice(0, MOST_OTHER_NAMES)];
	// (Checked by the name, not among the printings: a basic land has 750, more than are asked for.)
	const keys = names.map(lettersOnly);
	const named = corner.filter((card) => card.name.split(" // ").some((face) => keys.includes(lettersOnly(face))));
	if (named.length > 0) return found(named, "magicPrintingsNumber", { name: named[0].name, number: shown }, true);
	const printings = [];
	for (const each of names) {
		const search = await magicSearch('!"' + each.replace(/["“”]/g, "") + '"');
		printings.push(...search.cards.filter((card) => !FOREIGN_ONLY_SETS.includes(card.set.id)).slice(0, MOST_MAGIC_PRINTINGS));
	}
	const numbered = number ? printings.filter((card) => sameMagicNumber(card.number, number)) : [];
	if (numbered.length > 0) return found(numbered, "magicPrintingsNumber", { name: wanted, number: shown });
	const all = [...corner, ...printings];
	return all.length > 0 ? found(all, "magicPrintings", { name: wanted }) : nothing;
}

// Which of the cards found for a photo (see findMagicCardsOfPhoto) it shows, from how much each looks
// like it (ranked: from rankByLook in matcher.js): what pickBestMatch in matcher.js decides with these
// clues - { cards, clear } - codeSets being the set code read by the number ("soi"). But a card the
// corner didn't name opens by itself only when its picture looks like the photo
// (MAGIC_LOOK_MOST_DISTANCE): a misread name can be a real card's, and then its printings are only
// compared with each other.
function pickMagicCard(ranked, found, clues = {}) {
	const pick = pickBestMatch(ranked, true, clues);
	if (!pick.clear || found.byCorner) return pick;
	const first = ranked.find((entry) => entry.card === pick.cards[0]);
	return { cards: pick.cards, clear: first.distance <= MAGIC_LOOK_MOST_DISTANCE };
}

// True when a printing's number is the one read: "36★" (a foil-only printing) and "036" are 36.
function sameMagicNumber(printed, read) {
	const digits = String(printed).replace(/\D/g, "");
	return digits !== "" && Number(digits) === Number(read) && /^\d+/.test(String(printed));
}
