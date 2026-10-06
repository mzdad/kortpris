"use strict";

// Finds cards, with their prices, in TCGdex (tcgdex.net): a free card database that web pages may
// ask directly, with Cardmarket and TCGplayer prices from the same day. (Until version 1.32.0 the
// app used pokemontcg.io, which is being shut down: see ROADMAP.md, 5.1.)
//
// Its answers are turned into the cards the rest of the app knows (pokemontcg.io's shape):
// { id, name, number, rarity, supertype, set: { id, name, printedTotal, releaseDate },
//   images: { small, large } or null, variants: { normal, reverse, holo, firstEdition },
//   tcgplayer, cardmarket }
// A search finds cards without their prices: TCGdex gives those one card at a time, so withPrices
// adds them only to the cards that are shown.

const TCGDEX_API = "https://api.tcgdex.net/v2/en";
const TCGDEX_GRAPHQL = "https://api.tcgdex.net/v2/graphql";
// What a search asks for about each card.
const CARD_FIELDS = "id localId name rarity category image variants { normal reverse holo firstEdition }";
const RESULTS_PAGE_SIZE = 24;
// With a photo to compare against, a search on the name alone takes every card with that name, up to
// this many, newest first: "Pikachu" alone fits over 200, and the right one may be an old one. The
// artwork comparison (matcher.js) then finds it among them.
const WIDE_PAGE_SIZE = 250;
// TCGdex seldom fails (none of 40 requests in September 2026); a question that does is asked again.
const MAX_API_ATTEMPTS = 3;
const RETRY_DELAY_MS = 400;
// How long one question to a database may take, reading the answer included, before it counts as failed
// and is asked again (roadmap 5.4). Without a limit a question that never answered left "looking up" on
// the screen until the next scan - and kept every question after it waiting too (see askScryfallNow).
const API_ANSWER_WAIT_MS = 15000;
// TCGdex's answers are kept on the phone for a day (see askTcgdex), so scanning a card again, or
// opening a saved card, doesn't ask again - and works without internet. They are kept in the
// browser's Cache Storage, which holds far more than localStorage; sw.js leaves them alone.
// ("kortpris.sets" kept the sets alone in localStorage until 1.43.0, and is removed.)
const ANSWERS_CACHE = "kortpris-answers";
removeStorage("kortpris.sets");
const ANSWER_KEEP_MS = 24 * 60 * 60 * 1000;
// A name search can be 60 KB and a card's prices 3 KB, so this is a few MB at most. A day's
// scanning asks a few hundred questions.
const MOST_ANSWERS = 1000;
// When each answer was kept: a header of its own, so tidying needn't read the answers.
const KEPT_AT_HEADER = "Kortpris-Kept-At";
// TCGdex also has the sets of the TCG Pocket phone game, which aren't cards anyone can hold.
const DIGITAL_SERIES = ["tcgp"];
// TCGdex's pictures (WebP: a quarter of the PNG's size), and Scrydex's for the cards TCGdex has no
// picture of yet (mostly galleries, vaults and promos: see scrydexIdOf in card-ids.js).
const PICTURE_SMALL = "/low.webp";
const PICTURE_LARGE = "/high.webp";
const SCRYDEX_PICTURES = "https://images.scrydex.com/pokemon/";
// Where they came from until 1.44.0: the old database, which may close in March 2027.
const OLD_PICTURES = "https://images.pokemontcg.io/";
// Promo sets whose cards print a code before a plain number: "SVP EN 001" is card 1 of the
// Scarlet & Violet Black Star promos, set "svp"; "MEP EN 009" card 9 of the Mega Evolution ones, "mep"
// (a friend's Alakazam gave "No Alakazam card has the number MEP en 009" until version 1.61.0).
const PROMO_SET_CODES = { SVP: "svp", MEP: "mep" };
// The shops' pages for a card, by their own product numbers. (Cardmarket's is the form its own
// article gives for Magic cards, "cardmarket.com/Magic/Products?idProduct=1", which also picks the
// viewer's language; Cardmarket stops robots, so it couldn't be tried from here.)
const TCGPLAYER_PRODUCT = "https://www.tcgplayer.com/product/";
const CARDMARKET_PRODUCT = "https://www.cardmarket.com/Pokemon/Products?idProduct=";
// TCGdex's names for TCGplayer's versions, and the app's.
const TCGPLAYER_VERSION_NAMES = {
	"normal": "normal", "holofoil": "holofoil", "reverse-holofoil": "reverseHolofoil",
	"1st-edition": "1stEditionNormal", "1st-edition-holofoil": "1stEditionHolofoil",
	"unlimited": "unlimited", "unlimited-holofoil": "unlimitedHolofoil",
};
// TCGdex's names for Cardmarket's prices, and the app's. "-holo" is the reverse holo print.
const CARDMARKET_PRICE_NAMES = {
	"avg": "averageSellPrice", "low": "lowPrice", "trend": "trendPrice",
	"avg1": "avg1", "avg7": "avg7", "avg30": "avg30",
	"avg-holo": "reverseHoloSell", "low-holo": "reverseHoloLow", "trend-holo": "reverseHoloTrend",
	"avg1-holo": "reverseHoloAvg1", "avg7-holo": "reverseHoloAvg7", "avg30-holo": "reverseHoloAvg30",
};

// Saved and learned cards say which database their ids are from: cards from before version 1.32.0
// have none, and their ids are pokemontcg.io's (see currentCardIds).
const CARD_DATABASE = "tcgdex";
// At most this many ids are asked for in one question.
const IDS_PER_QUESTION = 100;

let setsPromise = null;          // every set: asked once per visit, and kept on the phone for a day
// Which card language the search is for: "en", or "ja" for Japanese cards (see japanese.js). The app
// says so when the viewer picks the game (setGame in app.js); everything that finds cards by name and
// number then asks the Japanese database instead.
let cardSearchLanguage = "en";

function setCardSearchLanguage(language) {
	cardSearchLanguage = language;
}
let reprintsPromise = null;      // the anniversary reprints, asked once
const pricesAsked = new Map();   // card id -> its prices (a promise), asked once per visit

// Searches for the card with this name and collector number ("4/102").
// Tries the most exact search first, then looser ones in case the photo was misread.
// Returns { cards, description, totalCount, exactFound, setSizes }: description says which kind
// of search found them, as a text key from strings.js plus the values to fill in. totalCount is
// how many cards fit altogether (more than are returned for a common name). exactFound means name
// and number matched a card exactly. No match gives an empty list.
// Throws an error when the database doesn't answer at all.
// withPhoto = true means a photo can pick among many cards by their looks (see matcher.js).
// numberGuesses are other numbers the reader thought possible (reader.js), tried in turn;
// the one that turned out right comes back as matchedNumber. setSizes are the set sizes in all
// the numbers tried ("102" of 8/102), and numbersRead all those numbers, for pickBestMatch in
// matcher.js.
async function findCards(name, numberText, withPhoto = false, numberGuesses = []) {
	if (cardSearchLanguage === "ja") return findJapaneseCards(name, numberText, withPhoto, numberGuesses);
	const nameWord = longestWord(name);
	const parsedNumber = parseCollectorNumber(numberText);
	const guesses = allNumberGuesses(numberText, withPhoto ? numberGuesses : []);
	// Everything needed is asked at once: the cards with the name, and those with each number read.
	const candidates = await askForCandidates(nameWord, guesses);
	const attempts = buildSearchAttempts(nameWord, parsedNumber, candidates);

	// Without a photo: the first search that finds anything wins.
	if (!withPhoto) {
		for (const attempt of attempts) {
			if (attempt.cards.length > 0) {
				return {
					cards: await withReprints(attempt.cards.slice(0, RESULTS_PAGE_SIZE)),
					description: attempt.description,
					totalCount: attempt.cards.length,
					exactFound: Boolean(attempt.exact),
				};
			}
		}
		return { cards: [], description: null, totalCount: 0, exactFound: false };
	}

	// With a photo: try each number the reader thought possible. An exact match on name and
	// number settles it - and shows which guess was right.
	const setSizes = [...new Set(guesses.map((guess) => parseCollectorNumber(guess).total).filter(Boolean))];
	const exact = await exactCardsAmong(nameWord, guesses, candidates);
	if (exact) return { ...exact, setSizes: setSizes, numbersRead: guesses };
	// Otherwise part of the text was misread, and nobody knows which part. So every looser
	// search goes into one pile, and the pictures decide - helped by the set sizes read, which
	// are often right even when the card's own number isn't (see pickBestMatch in matcher.js).
	// The set size alone doesn't settle it: a misread size can fit one card by pure chance.
	const looserAttempts = attempts.filter((attempt) => !attempt.exact);
	// The other numbers read are searched without the name too: a glittery "Pikachu" read as
	// "Pokéman" means the name is the misread part.
	for (const guess of guesses) {
		const parsed = parseCollectorNumber(guess);
		const alreadyInAttempts = parsed.number === parsedNumber.number && parsed.total === parsedNumber.total && parsed.set === parsedNumber.set;
		if (alreadyInAttempts) continue;
		// A promo's code alone fits just one card or two ("SWSH193").
		if (isPromoCode(parsed) || (parsed.number && parsed.total)) {
			looserAttempts.push({ cards: withNumber(candidates.byNumber.get(numberKey(parsed)) || [], parsed, true) });
		}
	}
	const pile = new Map();
	let totalCount = 0;
	for (const attempt of looserAttempts) {
		const pageSize = attempt.loose ? WIDE_PAGE_SIZE : RESULTS_PAGE_SIZE;
		for (const card of attempt.cards.slice(0, pageSize)) pile.set(card.id, card);
		totalCount = Math.max(totalCount, attempt.cards.length);
	}
	// None of those cards is from a set of the size read ("?/110" - the number itself was
	// unreadable): then the name was misread as well. Compare the photo with every card from a
	// set of that size - the set size is the one thing the reader saw for sure.
	let description = { key: "matchByLook", values: {} };
	const likeliestSize = parseCollectorNumber(guesses[0] || "").total;
	const pileHasSize = [...pile.values()].some((card) => String(card.set.printedTotal) === likeliestSize);
	if (likeliestSize && !pileHasSize) {
		const ofSize = await cardsFromSetsOfSize(Number(likeliestSize));
		for (const card of ofSize.slice(0, WIDE_PAGE_SIZE)) pile.set(card.id, card);
		if (ofSize.length > 0) description = { key: "matchSetSizeLook", values: { total: likeliestSize } };
	}
	const cards = await withReprints([...pile.values()]);
	return {
		cards: cards,
		description: cards.length > 0 ? description : null,
		totalCount: Math.max(totalCount, cards.length),
		exactFound: false,
		setSizes: setSizes,
		numbersRead: guesses,
	};
}

// The number in the box first, then the reader's other guesses, each once.
function allNumberGuesses(numberText, numberGuesses = []) {
	return [...new Set([numberText, ...numberGuesses].map((guess) => guess.trim()).filter(Boolean))];
}

// Searches for a card with this name and one of these collector numbers, trying each in turn.
// Returns what findCards returns for an exact match, with matchedNumber the guess that was
// right, or null when no guess fits a card of that name.
async function findExactCards(name, guesses) {
	const nameWord = longestWord(name);
	if (!nameWord) return null;
	return exactCardsAmong(nameWord, guesses, await askForCandidates(nameWord, []));
}

// The cards with one of these collector numbers, each in a set of the size read after its "/" (or
// in the set its promo code names), for a number read before the name (see cardByNumberAlone in
// matcher.js). Never a wider search: a misread number should find nothing, not a pile of cards.
// Returns { cards, setSizes }: setSizes as for findCards.
async function findCardsByNumber(numberGuesses) {
	if (cardSearchLanguage === "ja") return { cards: [], setSizes: [] };   // (Japanese cards aren't read from photos yet)
	const guesses = allNumberGuesses("", numberGuesses).filter((guess) => {
		const parsed = parseCollectorNumber(guess);
		return parsed.number && (parsed.total || isPromoCode(parsed));
	});
	const candidates = await askForCandidates("", guesses);
	const found = new Map();
	for (const guess of guesses) {
		const parsed = parseCollectorNumber(guess);
		for (const card of withNumber(candidates.byNumber.get(numberKey(parsed)) || [], parsed, true)) found.set(card.id, card);
	}
	const setSizes = [...new Set(guesses.map((guess) => parseCollectorNumber(guess).total).filter(Boolean))];
	return { cards: await withReprints([...found.values()]), setSizes: setSizes };
}

async function exactCardsAmong(nameWord, guesses, candidates) {
	if (!nameWord) return null;
	for (const guess of guesses) {
		const parsed = parseCollectorNumber(guess);
		if (!parsed.number || (!parsed.total && !isPromoCode(parsed))) continue;
		const cards = withNumber(candidates.byName, parsed, true);
		if (cards.length > 0) {
			return {
				cards: await withReprints(cards.slice(0, RESULTS_PAGE_SIZE)),
				description: { key: "matchExact", values: { name: nameWord, number: shownNumber(parsed) } },
				totalCount: cards.length,
				exactFound: true,
				matchedNumber: guess,
			};
		}
	}
	return null;
}

// Asks TCGdex, all at once, for the cards whose name holds nameWord and for the cards with each of
// these numbers. Returns { byName, byNumber: Map(numberKey -> cards) }, each list newest first.
async function askForCandidates(nameWord, guesses) {
	const numbers = new Map();
	for (const guess of guesses) {
		const parsed = parseCollectorNumber(guess);
		if (parsed.number) numbers.set(numberKey(parsed), parsed);
	}
	const [byName, ...numbered] = await Promise.all([
		nameWord ? cardsWhere('name: ' + JSON.stringify(nameWord)) : [],
		...[...numbers.values()].map((parsed) => cardsNumbered(parsed)),
	]);
	const byNumber = new Map([...numbers.keys()].map((key, index) => [key, numbered[index]]));
	return { byName: byName, byNumber: byNumber };
}

function numberKey(parsed) {
	return parsed.set + ":" + parsed.number;
}

// The cards with this number, in any set - or in the one set its promo code names.
async function cardsNumbered(parsed) {
	// TCGdex writes the numbers of some sets with zeros in front ("025"), so every spelling is
	// asked for. (Asked for one spelling alone, it finds nothing: at least two are needed.)
	const spellings = /^\d+$/.test(parsed.number)
		? [parsed.number, parsed.number.padStart(2, "0"), parsed.number.padStart(3, "0"), parsed.number.padStart(4, "0")]
		: [...numberSpellings(parsed.number), parsed.number.toLowerCase()];
	const cards = await cardsWhere("localId: " + JSON.stringify("eq:" + [...new Set(spellings)].join("|")));
	return withNumber(cards, parsed, false);
}

// The cards among these with this number (and set size, when withTotal and one was read).
function withNumber(cards, parsed, withTotal) {
	return cards.filter((card) =>
		sameNumber(card.number, parsed.number)
		&& (!parsed.set || card.set.id === parsed.set)
		&& (!withTotal || !parsed.total || String(card.set.printedTotal) === parsed.total));
}

function sameNumber(cardNumber, readNumber) {
	// "025" is 25; a promo code may have one zero more or less ("XY01" is XY001).
	if (/^\d+$/.test(cardNumber) && /^\d+$/.test(readNumber)) return Number(cardNumber) === Number(readNumber);
	return numberSpellings(readNumber).includes(String(cardNumber).toUpperCase());
}

// All the cards of every set of this size, newest first.
async function cardsFromSetsOfSize(size) {
	const sets = [...(await allSets()).values()].filter((set) => set.printedTotal === size);
	const lists = await Promise.all(sets.map((set) => cardsOfSet(set.id)));
	return sortNewestFirst(lists.flat());
}

async function cardsOfSet(setId) {
	// By their ids, which start with the set's: TCGdex's list of a set's own cards leaves out the
	// details asked for. ("30th-*" also finds set "30th-c", so the set is checked too.)
	const cards = await cardsWhere("id: " + JSON.stringify(setId + "-*"));
	return cards.filter((card) => card.set.id === setId);
}

// The cards with these ids ("lc-72"), fresh from the database, in the same order. An id the
// database doesn't have is left out. Magic cards' ids ("mtg:...") are asked of Scryfall (see
// findMagicCardsById in magic.js), Japanese cards' ("ja:SV2a-151") of TCGdex's Japanese database (see
// findJapaneseCardsById in japanese.js).
async function findCardsById(ids) {
	const magicIds = ids.filter(isMagicId);
	const japaneseIds = ids.filter(isJapaneseId);
	const pokemonIds = ids.filter((id) => !isMagicId(id) && !isJapaneseId(id));
	const cards = magicIds.length > 0 ? await findMagicCardsById(magicIds) : [];
	if (japaneseIds.length > 0) cards.push(...await findJapaneseCardsById(japaneseIds));
	for (let start = 0; start < pokemonIds.length; start += IDS_PER_QUESTION) {
		const some = pokemonIds.slice(start, start + IDS_PER_QUESTION);
		// Two ids at least (see cardsNumbered).
		cards.push(...await cardsWhere("id: " + JSON.stringify("eq:" + [...some, some[0]].join("|"))));
	}
	return ids.map((id) => cards.find((card) => card.id === id)).filter(Boolean);
}

// Magic: The Gathering cards' ids start with this (see magic.js), so a card's id alone says which game
// it is from.
const MAGIC_ID_START = "mtg:";

function isMagicId(id) {
	return String(id).startsWith(MAGIC_ID_START);
}

// The same for Japanese cards' ids ("ja:SV2a-151", see japanese.js): TCGdex's Japanese and English
// databases can use the same id for two cards.
const JAPANESE_ID_START = "ja:";

function isJapaneseId(id) {
	return String(id).startsWith(JAPANESE_ID_START);
}

function isJapaneseCard(card) {
	return isJapaneseId(card.id);
}

// The ids TCGdex knows these cards by, for ids from the old database, pokemontcg.io ("base6-86"
// is "lc-86"): Map(old id -> TCGdex's). Cards TCGdex doesn't have are left out; an id that is the
// same in both comes back as it is.
async function currentCardIds(oldIds) {
	const oldIdOf = new Map();   // each id the card may have in TCGdex -> its old id
	for (const oldId of oldIds) {
		for (const id of possibleCurrentIds(oldId)) oldIdOf.set(id, oldId);
	}
	const current = new Map();
	for (const card of await findCardsById([...oldIdOf.keys()])) {
		const oldId = oldIdOf.get(card.id);
		if (!current.has(oldId)) current.set(oldId, card.id);
	}
	return current;
}

function possibleCurrentIds(oldId) {
	// "sv3pt5-25" may be "sv03.5-25" or "sv03.5-025": TCGdex writes some sets' numbers with zeros.
	const at = oldId.lastIndexOf("-");
	const oldSetId = oldId.slice(0, at);
	const number = oldId.slice(at + 1);
	// Cards the old database numbered its own way, like "cel25c-4_A" for the Classic Collection
	// Charizard (Scrydex keeps its ids: see SCRYDEX_CARD_IDS in card-ids.js).
	const numberedOwnWay = Object.keys(SCRYDEX_CARD_IDS).find((id) => SCRYDEX_CARD_IDS[id] === oldId);
	if (numberedOwnWay) return [numberedOwnWay];
	if (oldSetId === OLD_REPRINT_SET) {
		const reprint = Object.entries(REPRINT_NUMBERS).find(([, old]) => old[0] === number);
		return reprint ? [REPRINT_SET + "-" + reprint[0]] : [];
	}
	const setId = OLD_SET_IDS[oldSetId] || oldSetId;
	const spellings = /^\d+$/.test(number) ? [number, number.padStart(2, "0"), number.padStart(3, "0")] : numberSpellings(number);
	return [...new Set(spellings)].map((spelling) => setId + "-" + spelling);
}

// The cards matching TCGdex's filters (like name: "Pikachu"), newest first, without the TCG
// Pocket phone game's.
async function cardsWhere(filters) {
	const [answer, sets] = await Promise.all([
		askGraphql("{ cards(filters: { " + filters + " }) { " + CARD_FIELDS + " set { id } } }"),
		allSets(),
	]);
	const cards = (answer.cards || []).map((raw) => appCard(raw, sets.get(raw.set && raw.set.id))).filter(Boolean);
	return sortNewestFirst(cards);
}

function sortNewestFirst(cards) {
	return cards.sort((a, b) =>
		String(b.set.releaseDate).localeCompare(String(a.set.releaseDate))
		|| a.set.id.localeCompare(b.set.id)
		|| String(a.number).localeCompare(String(b.number), "en", { numeric: true }));
}

// A card from TCGdex as the app knows it, without its prices; null for a card of a set the app
// leaves out (the TCG Pocket phone game's), and for the empty places TCGdex leaves in some sets.
function appCard(raw, set) {
	if (!raw || !raw.id || !set) return null;
	const card = {
		id: raw.id,
		name: raw.name,
		number: raw.localId,
		rarity: raw.rarity && raw.rarity !== "None" ? raw.rarity : "",
		supertype: raw.category === "Pokemon" ? "Pokémon" : raw.category,
		set: { id: set.id, name: set.name, printedTotal: set.printedTotal, releaseDate: set.releaseDate },
		images: picturesOf(raw, set.id),
		variants: raw.variants || {},
	};
	// An anniversary reprint carries its original's number, like "69/132", which is how it is read
	// and shown; TCGdex numbers them 1 to 30 or CC001 to CC025 (see reprintNumber in card-ids.js).
	const printed = reprintNumber(set.id, raw.localId);
	if (printed) {
		card.number = printed;
		card.set.printedTotal = null;
	}
	return card;
}

function picturesOf(raw, setId) {
	if (raw.image) return { small: raw.image + PICTURE_SMALL, large: raw.image + PICTURE_LARGE };
	// TCGdex has no picture of this card yet: Scrydex's, when it has the card.
	const scrydexId = scrydexIdOf(setId, raw.localId);
	if (!scrydexId) return null;
	return { small: SCRYDEX_PICTURES + scrydexId + "/small", large: SCRYDEX_PICTURES + scrydexId + "/large" };
}

// The picture to keep with a card saved or learned under TCGdex's id (cardId): Scrydex's instead of
// one borrowed from the old database before 1.44.0 (see picturesOf). Any other comes back as it is.
function currentPicture(cardId, image) {
	if (!image || !image.startsWith(OLD_PICTURES)) return image;
	const at = cardId.lastIndexOf("-");
	const scrydexId = scrydexIdOf(cardId.slice(0, at), cardId.slice(at + 1));
	return scrydexId ? SCRYDEX_PICTURES + scrydexId + "/small" : image;
}

// Every set of cards you can hold: Map(id -> { id, name, printedTotal, releaseDate }). Asked
// once per visit, and kept on the phone for a day.
function allSets() {
	if (!setsPromise) {
		setsPromise = loadSets();
		setsPromise.catch(() => { setsPromise = null; });   // ask again on the next search
	}
	return setsPromise;
}

async function loadSets() {
	const answer = await askGraphql("{ sets { id name releaseDate cardCount { official } serie { id } } }");
	const list = (answer.sets || [])
		.filter((set) => !DIGITAL_SERIES.includes(set.serie && set.serie.id))
		.map((set) => ({ id: set.id, name: set.name, printedTotal: (set.cardCount && set.cardCount.official) || null, releaseDate: set.releaseDate || "" }));
	return new Map(list.map((set) => [set.id, set]));
}

// Adds the card's prices to it - tcgplayer and cardmarket, each left out when that shop has none -
// and returns it. Asked from TCGdex once per visit, or kept from the last day (see askTcgdex).
// fresh = true asks TCGdex again even so: "Update prices" in My cards. Throws when TCGdex doesn't
// answer; the card then stays without prices, and they are asked for again the next time.
async function withPrices(card, fresh = false) {
	if (isJapaneseCard(card)) return withJapanesePrices(card, fresh);
	if (card.pricesLoaded && !fresh) return card;
	if (!pricesAsked.has(card.id) || fresh) {
		const asking = askTcgdex(TCGDEX_API + "/cards/" + encodeURIComponent(card.id), null, fresh).then((full) => pricesFrom(full.pricing));
		asking.catch(() => pricesAsked.delete(card.id));
		pricesAsked.set(card.id, asking);
	}
	const prices = await pricesAsked.get(card.id);
	if (prices.tcgplayer) card.tcgplayer = prices.tcgplayer;
	if (prices.cardmarket) card.cardmarket = prices.cardmarket;
	card.pricesLoaded = true;
	return card;
}

function pricesFrom(pricing) {
	// TCGdex's prices, named and shaped as the app knows them from pokemontcg.io.
	const prices = {};
	const tcgplayer = (pricing && pricing.tcgplayer) || {};
	const versions = {};
	let productId = null;
	for (const [name, price] of Object.entries(tcgplayer)) {
		const appName = TCGPLAYER_VERSION_NAMES[name];
		if (!appName || !price || typeof price !== "object") continue;
		versions[appName] = { low: price.lowPrice, mid: price.midPrice, high: price.highPrice, market: price.marketPrice, directLow: price.directLowPrice };
		productId = productId || price.productId || null;
	}
	if (Object.keys(versions).length > 0) {
		prices.tcgplayer = { url: productId ? TCGPLAYER_PRODUCT + productId : "", productId: productId, updatedAt: dayOf(tcgplayer.updated), prices: versions };
	}
	const cardmarket = (pricing && pricing.cardmarket) || {};
	const cardmarketPrices = {};
	for (const [name, appName] of Object.entries(CARDMARKET_PRICE_NAMES)) {
		if (typeof cardmarket[name] === "number") cardmarketPrices[appName] = cardmarket[name];
	}
	if (Object.keys(cardmarketPrices).length > 0) {
		prices.cardmarket = { url: cardmarket.idProduct ? CARDMARKET_PRODUCT + cardmarket.idProduct : "", updatedAt: dayOf(cardmarket.updated), prices: cardmarketPrices };
	}
	return prices;
}

function dayOf(isoTime) {
	// "2026-09-26T09:51:35Z" -> "2026/09/26", as the app shows and compares dates.
	return isoTime ? String(isoTime).slice(0, 10).replace(/-/g, "/") : null;
}

async function withReprints(cards) {
	// The cards found, plus the anniversary reprints of any of them: the 30th Celebration's (2026)
	// and the Celebrations Classic Collection's (2021). If the database doesn't answer, the cards
	// alone: the reprints are an extra, not worth failing the search for.
	let reprints;
	try {
		reprints = await allReprints();
	} catch (problem) {
		return cards;
	}
	const extra = reprints.filter((reprint) =>
		!cards.some((card) => card.id === reprint.id)
		&& cards.some((card) => isReprintOf(reprint, card)));
	return [...cards, ...extra];
}

function allReprints() {
	if (!reprintsPromise) {
		reprintsPromise = Promise.all([cardsOfSet(REPRINT_SET), cardsOfSet(CLASSIC_SET)]).then(([thirtieth, classic]) => [...thirtieth, ...classic]);
		reprintsPromise.catch(() => { reprintsPromise = null; });   // try again on the next search
	}
	return reprintsPromise;
}

function isAnniversaryReprint(card) {
	return card.set.id === REPRINT_SET || card.set.id === CLASSIC_SET;
}

function isReprintOf(reprint, card) {
	if (isAnniversaryReprint(card)) return false;
	// A Classic Collection card: one of its originals listed in CLASSIC_NUMBERS (card-ids.js).
	if (reprint.set.id === CLASSIC_SET) {
		const classic = CLASSIC_NUMBERS[reprint.id.slice(CLASSIC_SET.length + 1)];
		return Boolean(classic) && classic[1].includes(card.id);
	}
	// A 30th Celebration card: the same name and number.
	return reprint.set.id === REPRINT_SET
		&& reprint.name.toLowerCase() === card.name.toLowerCase()
		&& sameNumber(card.number, reprint.number);
}

// A Black Star promo's code, like "SWSH193" or "SVP 001": letters then digits, and no set size.
// Also the numbers of a set within a set, "GG01/GG70": their set size isn't the whole set's.
function isPromoCode(parsed) {
	return parsed.total === "" && (parsed.set !== "" || /^[A-Z]+\d+$/.test(parsed.number));
}

function numberSpellings(number) {
	// A code with zeros more or less in front of its digits: tiny print easily gains or loses one
	// ("XY001" is XY01, "SWSH0001" is SWSH001), and TCGdex writes some differently from the card
	// ("H1" is its "H01", "BW004" its "BW04"). Plain numbers have only the one spelling.
	const code = number.match(/^([A-Z]+)(\d+)$/);
	if (!code) return [number];
	const letters = code[1];
	const value = String(Number(code[2]));
	return [...new Set([number, letters + value, letters + value.padStart(2, "0"), letters + value.padStart(3, "0")])];
}

function shownNumber(parsed) {
	// A number as the texts show it: "4/102", "SWSH193", "SVP 1".
	if (parsed.set) return parsed.set.toUpperCase() + " " + parsed.number;
	return parsed.total ? parsed.number + "/" + parsed.total : parsed.number;
}

// True when there is enough to search on: a name, a number, or at least a set size ("?/110").
function canSearch(name, numberText) {
	const { number, total } = parseCollectorNumber(numberText);
	return longestWord(name) !== "" || number !== "" || total !== "";
}

function longestWord(name) {
	// Search on the longest word only: "Charizard ex" then also finds "Charizard EX",
	// and a misread short word can't spoil the search.
	let longest = "";
	for (const word of name.split(/\s+/)) {
		const safe = word.replace(/[^\p{L}.'’-]/gu, "");
		if (safe.length > longest.length) longest = safe;
	}
	return longest;
}

function parseCollectorNumber(text) {
	// "4/102" becomes number "4" and total "102". Plain digits lose their leading zeros
	// ("006" -> "6"), so they compare as numbers. set is the database's set when a promo code
	// names one: "SVP EN 001" is number "1" of set "svp".
	const [numberPart = "", totalPart = ""] = text.toUpperCase().replace(/\s+/g, "").split("/");
	const promo = numberPart.match(/^([A-Z]+?)(?:EN)?(\d+)$/);
	if (promo && PROMO_SET_CODES[promo[1]] && totalPart === "") {
		return { number: String(Number(promo[2])), total: "", set: PROMO_SET_CODES[promo[1]] };
	}
	const number = /^\d+$/.test(numberPart) ? String(Number(numberPart)) : numberPart.replace(/[^A-Z0-9]/g, "");
	const total = /^\d+$/.test(totalPart) ? String(Number(totalPart)) : "";
	return { number, total, set: "" };
}

function buildSearchAttempts(nameWord, parsed, candidates) {
	// Each attempt is the cards one kind of search finds, plus the text explaining what it found.
	const { number, total } = parsed;
	const shown = shownNumber(parsed);
	const byName = candidates.byName;
	const byNumber = candidates.byNumber.get(numberKey(parsed)) || [];
	const attempts = [];
	if (nameWord && number && total) {
		attempts.push({
			cards: withNumber(byName, parsed, true),
			description: { key: "matchExact", values: { name: nameWord, number: shown } },
			exact: true,
		});
	}
	if (nameWord && number) {
		attempts.push({
			cards: withNumber(byName, parsed, false),
			description: { key: "matchAnySet", values: { name: nameWord, number: shownNumber({ ...parsed, total: "" }) } },
		});
	}
	if (nameWord && total) {
		// The number was misread, but the set's size ("/108") may still be right.
		attempts.push({
			cards: byName.filter((card) => String(card.set.printedTotal) === total),
			description: { key: "matchNameTotal", values: { name: nameWord, total: total } },
		});
	}
	if (number && total) {
		attempts.push({
			cards: withNumber(byNumber, parsed, true),
			description: nameWord
				? { key: "matchNumberNameMissed", values: { name: nameWord, number: shown } }
				: { key: "matchNumberOnly", values: { number: shown } },
		});
	}
	// The last two are "loose": they can fit a great many cards.
	if (nameWord) {
		attempts.push({
			cards: byName,
			description: { key: "matchNameOnly", values: { name: nameWord } },
			loose: true,
		});
	}
	if (!nameWord && number && !total) {
		attempts.push({
			cards: byNumber,
			description: { key: "matchNumberNoTotal", values: { number: shown } },
			loose: true,
		});
	}
	return attempts;
}

async function askGraphql(query) {
	const body = await askTcgdex(TCGDEX_GRAPHQL, { query: query });
	if (body.errors && !body.data) throw new Error("Card database: " + JSON.stringify(body.errors).slice(0, 200));
	return body.data || {};
}

// Asks TCGdex (GET, or POST with a body) and returns its answer: the one kept on the phone, when it
// is less than a day old and fresh isn't true. A new answer is kept for next time, unless it
// reports errors. Throws when there is no answer (see askTcgdexNow).
async function askTcgdex(url, postBody = null, fresh = false) {
	const keptAs = await answerAddress(url, postBody);
	if (keptAs && !fresh) {
		const kept = await keptAnswer(keptAs);
		if (kept) return kept;
	}
	const answer = await askTcgdexNow(url, postBody);
	// Written down now, before the caller can change it.
	if (keptAs && !answer.errors) keepAnswer(keptAs, JSON.stringify(answer));
	return answer;
}

// Where an answer is kept: the question's own address - with its body's fingerprint added when it
// has one, as GraphQL asks everything at the same address. null when the browser can't make
// fingerprints (only on pages not served over https): the answer then isn't kept.
async function answerAddress(url, postBody) {
	if (!postBody) return url;
	try {
		const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(postBody)));
		const fingerprint = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
		return url + "?question=" + fingerprint;
	} catch (error) {
		return null;
	}
}

// The answer kept at this address when it is less than a day old, or null.
async function keptAnswer(address) {
	try {
		const kept = await (await caches.open(ANSWERS_CACHE)).match(address);
		return kept && keptLessThanADay(kept) ? await kept.json() : null;
	} catch (error) {
		return null;   // no Cache Storage here (private browsing can block it): ask the internet
	}
}

function keptLessThanADay(kept) {
	return Date.now() - Number(kept.headers.get(KEPT_AT_HEADER)) < ANSWER_KEEP_MS;
}

let answersTidied = false;   // once per visit (see tidyAnswers)

async function keepAnswer(address, text) {
	try {
		const cache = await caches.open(ANSWERS_CACHE);
		await cache.put(address, new Response(text, { headers: { "Content-Type": "application/json", [KEPT_AT_HEADER]: String(Date.now()) } }));
		if (!answersTidied) {
			answersTidied = true;
			await tidyAnswers(cache);
		}
	} catch (error) {
		// The phone is full, or keeping isn't allowed: the question is asked again next time.
	}
}

// Throws away the answers kept more than a day ago, and the oldest when there are more than
// MOST_ANSWERS. Once per visit is enough: until then they are only added to.
async function tidyAnswers(cache) {
	const fresh = [];
	for (const address of await cache.keys()) {
		const kept = await cache.match(address);
		if (kept && keptLessThanADay(kept)) fresh.push({ address: address, keptAt: Number(kept.headers.get(KEPT_AT_HEADER)) });
		else await cache.delete(address);
	}
	fresh.sort((a, b) => b.keptAt - a.keptAt);   // newest first
	for (const old of fresh.slice(MOST_ANSWERS)) await cache.delete(old.address);
}

// Asks TCGdex itself. A failed question is asked again a couple of times. Throws when there is no
// answer, marked tooManyLookups when TCGdex says it has been asked too often (429): asking again
// would only make that last longer.
async function askTcgdexNow(url, postBody) {
	let lastProblem = null;
	for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt++) {
		try {
			return await withinAnswerWait(async (signal) => {
				const response = await fetch(url, postBody
					? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(postBody), signal: signal }
					: { signal: signal });
				if (response.ok) return await response.json();
				const problem = new Error("Card database answered " + response.status);
				problem.tooManyLookups = response.status === 429;
				// Not there, or not allowed: asking again won't change that.
				problem.final = problem.tooManyLookups || (response.status >= 400 && response.status < 500);
				throw problem;
			});
		} catch (problem) {
			if (problem.final) throw problem;
			lastProblem = problem;   // also a question that took too long: it was stopped, see withinAnswerWait
		}
		if (attempt < MAX_API_ATTEMPTS) await wait(RETRY_DELAY_MS * attempt);   // a little longer each time
	}
	throw lastProblem;
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs ask(signal), one question to a database, and stops it when it takes longer than API_ANSWER_WAIT_MS:
// the signal ends the fetch (and the reading of its answer), which then throws, as a failed question does.
async function withinAnswerWait(ask) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), API_ANSWER_WAIT_MS);
	try {
		return await ask(controller.signal);
	} finally {
		clearTimeout(timer);
	}
}
