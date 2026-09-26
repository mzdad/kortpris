"use strict";

// Finds cards, with their prices, in the free Pokémon TCG API (pokemontcg.io).

const API_URL = "https://api.pokemontcg.io/v2/cards";
// Only ask for the fields we show, so answers arrive faster on mobile data.
const CARD_FIELDS = "id,name,number,rarity,supertype,set,images,tcgplayer,cardmarket";
const RESULTS_PAGE_SIZE = 24;
// With a photo to compare against, a search on the name alone fetches every card with that name
// (250 is the most the database gives at once): "Pikachu" alone fits over 200, and the right one
// may be an old one. The artwork comparison (matcher.js) then finds it among them.
const WIDE_PAGE_SIZE = 250;
// The free price database fails about half of its requests on the first try
// (measured September 2026), so every lookup is sent twice at once and retried a few times.
const MAX_API_ATTEMPTS = 6;
const RETRY_DELAY_MS = 400;
// Sets that print old cards again with the old card's own number: the 2026 reprint of Erika's
// Jigglypuff says "69/132", just like the one from 2000. The database knows no set size for
// these sets, so a search on the number never finds them - they are added next to their
// originals instead (see withReprints), and the photo decides which one it is (matcher.js).
const ANNIVERSARY_REPRINT_SETS = ["me55c"];   // 30th Celebration: Classic Collection (2026)
// Promo sets whose cards print a code before a plain number: "SVP EN 001" is card 1 of the
// Scarlet & Violet Black Star promos, which the database numbers just "1" in set "svp".
const PROMO_SET_CODES = { SVP: "svp" };

// The reprints, fetched once: the sets are small (30 cards).
let reprintsPromise = null;

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
	const nameWord = longestWord(name);
	const parsedNumber = parseCollectorNumber(numberText);
	const { number, total } = parsedNumber;
	const attempts = buildSearchAttempts(nameWord, parsedNumber);

	// Without a photo: the first search that finds anything wins.
	if (!withPhoto) {
		for (const attempt of attempts) {
			const page = await fetchCardPage(attempt.query, RESULTS_PAGE_SIZE);
			if (page.cards.length > 0) {
				return {
					cards: await withReprints(page.cards),
					description: attempt.description,
					totalCount: page.totalCount,
					exactFound: Boolean(attempt.exact),
				};
			}
		}
		return { cards: [], description: null, totalCount: 0, exactFound: false };
	}

	// With a photo: try each number the reader thought possible. An exact match on name and
	// number settles it - and shows which guess was right.
	const guesses = allNumberGuesses(numberText, numberGuesses);
	const setSizes = [...new Set(guesses.map((guess) => parseCollectorNumber(guess).total).filter(Boolean))];
	const exact = await findExactCards(name, guesses);
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
		const alreadyInAttempts = parsed.number === number && parsed.total === total && parsed.set === parsedNumber.set;
		if (alreadyInAttempts) continue;
		// A promo's code alone fits just one card or two ("SWSH193").
		if (isPromoCode(parsed) || (parsed.number && parsed.total)) looserAttempts.push({ query: numberQuery(parsed) });
	}
	const pile = new Map();
	let totalCount = 0;
	for (const attempt of looserAttempts) {
		const pageSize = attempt.loose ? WIDE_PAGE_SIZE : RESULTS_PAGE_SIZE;
		const page = await fetchCardPage(attempt.query, pageSize);
		for (const card of page.cards) pile.set(card.id, card);
		totalCount = Math.max(totalCount, page.totalCount);
	}
	// None of those cards is from a set of the size read ("?/110" - the number itself was
	// unreadable): then the name was misread as well. Compare the photo with every card from a
	// set of that size - the set size is the one thing the reader saw for sure.
	let description = { key: "matchByLook", values: {} };
	const likeliestSize = parseCollectorNumber(guesses[0] || "").total;
	const pileHasSize = [...pile.values()].some((card) => String(card.set.printedTotal) === likeliestSize);
	if (likeliestSize && !pileHasSize) {
		const page = await fetchCardPage("set.printedTotal:" + likeliestSize, WIDE_PAGE_SIZE);
		for (const card of page.cards) pile.set(card.id, card);
		if (page.cards.length > 0) description = { key: "matchSetSizeLook", values: { total: likeliestSize } };
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
	for (const guess of guesses) {
		const parsed = parseCollectorNumber(guess);
		if (!parsed.number || (!parsed.total && !isPromoCode(parsed))) continue;
		const page = await fetchCardPage(nameQueryFor(nameWord) + " " + numberQuery(parsed), RESULTS_PAGE_SIZE);
		if (page.cards.length > 0) {
			return {
				cards: await withReprints(page.cards),
				description: { key: "matchExact", values: { name: nameWord, number: shownNumber(parsed) } },
				totalCount: page.totalCount,
				exactFound: true,
				matchedNumber: guess,
			};
		}
	}
	return null;
}

// The cards with these ids ("base6-72"), fresh from the database, in the same order. An id the
// database no longer has is left out.
async function findCardsById(ids) {
	if (ids.length === 0) return [];
	const cards = await fetchCards(ids.map((id) => "id:" + id).join(" OR "), ids.length);
	return ids.map((id) => cards.find((card) => card.id === id)).filter(Boolean);
}

async function withReprints(cards) {
	// The cards found, plus the anniversary reprint of any of them. If the database doesn't
	// answer, the cards alone: the reprints are an extra, not worth failing the search for.
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
		const query = ANNIVERSARY_REPRINT_SETS.map((setId) => "set.id:" + setId).join(" OR ");
		reprintsPromise = fetchCards(query, WIDE_PAGE_SIZE);
		reprintsPromise.catch(() => { reprintsPromise = null; });   // try again on the next search
	}
	return reprintsPromise;
}

function isAnniversaryReprint(card) {
	return ANNIVERSARY_REPRINT_SETS.includes(card.set.id);
}

function isReprintOf(reprint, card) {
	// Same name and same number, but not itself a reprint.
	return isAnniversaryReprint(reprint) && !isAnniversaryReprint(card)
		&& reprint.name.toLowerCase() === card.name.toLowerCase()
		&& reprint.number === card.number;
}

// A Black Star promo's code, like "SWSH193" or "SVP 001": letters then digits, and no set size.
// Also the numbers of a set within a set, "GG01/GG70": their set size isn't the whole set's.
function isPromoCode(parsed) {
	return parsed.total === "" && (parsed.set !== "" || /^[A-Z]+\d+$/.test(parsed.number));
}

function numberQuery(parsed) {
	// The database query for a collector number, with the set size when there is one.
	const query = cardNumberQuery(parsed);
	return parsed.total ? query + " set.printedTotal:" + parsed.total : query;
}

function cardNumberQuery(parsed) {
	// The card's own number, from any set - or from the one set its promo code names.
	if (parsed.set) return "set.id:" + parsed.set + " number:" + parsed.number;
	const spellings = numberSpellings(parsed.number);
	if (spellings.length === 1) return "number:" + parsed.number;
	return "(" + spellings.map((spelling) => "number:" + spelling).join(" OR ") + ")";
}

function numberSpellings(number) {
	// A promo code with one zero more or less, as tiny print easily gains or loses one: "XY001"
	// is XY01, "SWSH0001" is SWSH001. Plain numbers have only the one spelling.
	const code = number.match(/^([A-Z]+)(\d+)$/);
	if (!code) return [number];
	const letters = code[1];
	const digits = code[2];
	const spellings = [number];
	if (digits.startsWith("0")) spellings.push(letters + digits.slice(1));
	if (digits.length === 2) spellings.push(letters + "0" + digits);
	return spellings;
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
	// "4/102" becomes number "4" and total "102". Plain digits lose their leading
	// zeros ("006" -> "6") because the database stores them that way. set is the database's set
	// when a promo code names one: "SVP EN 001" is number "1" of set "svp".
	const [numberPart = "", totalPart = ""] = text.toUpperCase().replace(/\s+/g, "").split("/");
	const promo = numberPart.match(/^([A-Z]+?)(?:EN)?(\d+)$/);
	if (promo && PROMO_SET_CODES[promo[1]] && totalPart === "") {
		return { number: String(Number(promo[2])), total: "", set: PROMO_SET_CODES[promo[1]] };
	}
	const number = /^\d+$/.test(numberPart) ? String(Number(numberPart)) : numberPart.replace(/[^A-Z0-9]/g, "");
	const total = /^\d+$/.test(totalPart) ? String(Number(totalPart)) : "";
	return { number, total, set: "" };
}

function nameQueryFor(nameWord) {
	// The * lets "Charizard" also find "Charizard ex", "Charizard VMAX" and "Blaine's Charizard".
	return 'name:"' + nameWord + '*"';
}

function buildSearchAttempts(nameWord, parsed) {
	// Each attempt is a database query plus the text explaining what it found.
	const nameQuery = nameQueryFor(nameWord);
	const { number, total } = parsed;
	const shown = shownNumber(parsed);
	const attempts = [];
	if (nameWord && number && total) {
		attempts.push({
			query: nameQuery + " " + numberQuery(parsed),
			description: { key: "matchExact", values: { name: nameWord, number: shown } },
			exact: true,
		});
	}
	if (nameWord && number) {
		attempts.push({
			query: nameQuery + " " + cardNumberQuery(parsed),
			description: { key: "matchAnySet", values: { name: nameWord, number: shownNumber({ ...parsed, total: "" }) } },
		});
	}
	if (nameWord && total) {
		// The number was misread, but the set's size ("/108") may still be right.
		attempts.push({
			query: nameQuery + " set.printedTotal:" + total,
			description: { key: "matchNameTotal", values: { name: nameWord, total: total } },
		});
	}
	if (number && total) {
		attempts.push({
			query: numberQuery(parsed),
			description: nameWord
				? { key: "matchNumberNameMissed", values: { name: nameWord, number: shown } }
				: { key: "matchNumberOnly", values: { number: shown } },
		});
	}
	// The last two are "loose": they can fit a great many cards.
	if (nameWord) {
		attempts.push({
			query: nameQuery,
			description: { key: "matchNameOnly", values: { name: nameWord } },
			loose: true,
		});
	}
	if (!nameWord && number && !total) {
		attempts.push({
			query: cardNumberQuery(parsed),
			description: { key: "matchNumberNoTotal", values: { number: shown } },
			loose: true,
		});
	}
	return attempts;
}

async function fetchCards(query, pageSize) {
	return (await fetchCardPage(query, pageSize)).cards;
}

// Returns { cards, totalCount }: the first pageSize matching cards, newest first,
// and how many cards match altogether.
async function fetchCardPage(query, pageSize) {
	const url = API_URL
		+ "?q=" + encodeURIComponent(query)
		+ "&orderBy=-set.releaseDate"
		+ "&pageSize=" + pageSize
		+ "&select=" + CARD_FIELDS;
	let lastProblem = null;
	for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt++) {
		try {
			// Each try sends the same question twice at once and takes whichever answer
			// comes back first: with half of all requests failing, both failing is far rarer.
			const body = await Promise.any([askOnce(url), askOnce(url)]);
			return { cards: body.data || [], totalCount: body.totalCount || 0 };
		} catch (problem) {
			lastProblem = problem.errors ? problem.errors[0] : problem;
		}
		await wait(RETRY_DELAY_MS * attempt);   // wait a little longer after each failure
	}
	throw lastProblem;
}

async function askOnce(url) {
	// Throws when there is no answer at all (like a dropped connection) or an error answer.
	const response = await fetch(url);
	if (!response.ok) throw new Error("Price database answered " + response.status);
	return response.json();
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
