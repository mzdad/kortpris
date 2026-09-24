"use strict";

// Finds cards, with their prices, in the free Pokémon TCG API (pokemontcg.io).

const API_URL = "https://api.pokemontcg.io/v2/cards";
// Only ask for the fields we show, so answers arrive faster on mobile data.
const CARD_FIELDS = "id,name,number,rarity,set,images,tcgplayer,cardmarket";
const RESULTS_PAGE_SIZE = 24;
// With a photo to compare against, a search on the name alone fetches every card with that name
// (250 is the most the database gives at once): "Pikachu" alone fits over 200, and the right one
// may be an old one. The artwork comparison (matcher.js) then finds it among them.
const WIDE_PAGE_SIZE = 250;
// The free price database fails about half of its requests on the first try
// (measured September 2026), so every lookup is sent twice at once and retried a few times.
const MAX_API_ATTEMPTS = 6;
const RETRY_DELAY_MS = 400;

// Searches for the card with this name and collector number ("4/102").
// Tries the most exact search first, then looser ones in case the photo was misread.
// Returns { cards, description, totalCount, exactFound }: description says which kind of search
// found them, as a text key from strings.js plus the values to fill in. totalCount is how many
// cards fit altogether (more than are returned for a common name). exactFound means name and
// number matched a card exactly. No match gives an empty list.
// Throws an error when the database doesn't answer at all.
// withPhoto = true means a photo can pick among many cards by their looks (see matcher.js).
// numberGuesses are other numbers the reader thought possible (reader.js), tried in turn;
// the one that turned out right comes back as matchedNumber.
async function findCards(name, numberText, withPhoto = false, numberGuesses = []) {
	const nameWord = longestWord(name);
	const { number, total } = parseCollectorNumber(numberText);
	const attempts = buildSearchAttempts(nameWord, number, total);

	// Without a photo: the first search that finds anything wins.
	if (!withPhoto) {
		for (const attempt of attempts) {
			const page = await fetchCardPage(attempt.query, RESULTS_PAGE_SIZE);
			if (page.cards.length > 0) {
				return {
					cards: page.cards,
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
	const guesses = [...new Set([numberText, ...numberGuesses].map((guess) => guess.trim()).filter(Boolean))];
	if (nameWord) {
		for (const guess of guesses) {
			const parsed = parseCollectorNumber(guess);
			if (!parsed.number || !parsed.total) continue;
			const query = nameQueryFor(nameWord) + " number:" + parsed.number + " set.printedTotal:" + parsed.total;
			const page = await fetchCardPage(query, RESULTS_PAGE_SIZE);
			if (page.cards.length > 0) {
				return {
					cards: page.cards,
					description: { key: "matchExact", values: { name: nameWord, number: parsed.number + "/" + parsed.total } },
					totalCount: page.totalCount,
					exactFound: true,
					matchedNumber: guess,
				};
			}
		}
		// The set's size is often read right even when the card's own number isn't. If just one
		// card with this name comes from a set of that size, it is the one.
		const setSizes = [...new Set(guesses.map((guess) => parseCollectorNumber(guess).total).filter(Boolean))];
		for (const setSize of setSizes) {
			const page = await fetchCardPage(nameQueryFor(nameWord) + " set.printedTotal:" + setSize, RESULTS_PAGE_SIZE);
			if (page.cards.length === 1) {
				return {
					cards: page.cards,
					description: { key: "matchNameTotal", values: { name: nameWord, total: setSize } },
					totalCount: 1,
					exactFound: false,
					setSizeFound: true,
				};
			}
		}
	}
	// Otherwise part of the text was misread, and nobody knows which part. So every looser
	// search goes into one pile, and the pictures decide.
	const pile = new Map();
	let totalCount = 0;
	for (const attempt of attempts) {
		if (attempt.exact) continue;
		const pageSize = attempt.loose ? WIDE_PAGE_SIZE : RESULTS_PAGE_SIZE;
		const page = await fetchCardPage(attempt.query, pageSize);
		for (const card of page.cards) pile.set(card.id, card);
		totalCount = Math.max(totalCount, page.totalCount);
	}
	const cards = [...pile.values()];
	return {
		cards: cards,
		description: cards.length > 0 ? { key: "matchByLook", values: {} } : null,
		totalCount: Math.max(totalCount, cards.length),
		exactFound: false,
	};
}

// True when there is enough to search on: a name or a number.
function canSearch(name, numberText) {
	return longestWord(name) !== "" || parseCollectorNumber(numberText).number !== "";
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
	// zeros ("006" -> "6") because the database stores them that way.
	const [numberPart = "", totalPart = ""] = text.toUpperCase().replace(/\s+/g, "").split("/");
	const number = /^\d+$/.test(numberPart) ? String(Number(numberPart)) : numberPart.replace(/[^A-Z0-9]/g, "");
	const total = /^\d+$/.test(totalPart) ? String(Number(totalPart)) : "";
	return { number, total };
}

function nameQueryFor(nameWord) {
	// The * lets "Charizard" also find "Charizard ex", "Charizard VMAX" and "Blaine's Charizard".
	return 'name:"' + nameWord + '*"';
}

function buildSearchAttempts(nameWord, number, total) {
	// Each attempt is a database query plus the text explaining what it found.
	const nameQuery = nameQueryFor(nameWord);
	const shownNumber = total ? number + "/" + total : number;
	const attempts = [];
	if (nameWord && number && total) {
		attempts.push({
			query: nameQuery + " number:" + number + " set.printedTotal:" + total,
			description: { key: "matchExact", values: { name: nameWord, number: shownNumber } },
			exact: true,
		});
	}
	if (nameWord && number) {
		attempts.push({
			query: nameQuery + " number:" + number,
			description: { key: "matchAnySet", values: { name: nameWord, number: number } },
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
			query: "number:" + number + " set.printedTotal:" + total,
			description: nameWord
				? { key: "matchNumberNameMissed", values: { name: nameWord, number: shownNumber } }
				: { key: "matchNumberOnly", values: { number: shownNumber } },
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
			query: "number:" + number,
			description: { key: "matchNumberNoTotal", values: { number: number } },
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
