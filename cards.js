"use strict";

// Finds cards, with their prices, in the free Pokémon TCG API (pokemontcg.io).

const API_URL = "https://api.pokemontcg.io/v2/cards";
// Only ask for the fields we show, so answers arrive faster on mobile data.
const CARD_FIELDS = "id,name,number,rarity,set,images,tcgplayer,cardmarket";
const RESULTS_PAGE_SIZE = 24;
// The free price database fails about half of its requests on the first try
// (measured September 2026), so every lookup is retried a few times.
const MAX_API_ATTEMPTS = 6;
const RETRY_DELAY_MS = 400;

// Searches for the card with this name and collector number ("4/102").
// Tries the most exact search first, then looser ones in case the photo was misread.
// Returns { cards, description }: description says which kind of search found them,
// as a text key from strings.js plus the values to fill in. No match gives an empty list.
// Throws an error when the database doesn't answer at all.
async function findCards(name, numberText) {
	const nameWord = longestWord(name);
	const { number, total } = parseCollectorNumber(numberText);
	for (const attempt of buildSearchAttempts(nameWord, number, total)) {
		const cards = await fetchCards(attempt.query);
		if (cards.length > 0) return { cards: cards, description: attempt.description };
	}
	return { cards: [], description: null };
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

function buildSearchAttempts(nameWord, number, total) {
	// Each attempt is a database query plus the text explaining what it found.
	const nameQuery = 'name:"' + nameWord + '*"';
	const shownNumber = total ? number + "/" + total : number;
	const attempts = [];
	if (nameWord && number && total) {
		attempts.push({
			query: nameQuery + " number:" + number + " set.printedTotal:" + total,
			description: { key: "matchExact", values: { name: nameWord, number: shownNumber } },
		});
	}
	if (nameWord && number) {
		attempts.push({
			query: nameQuery + " number:" + number,
			description: { key: "matchAnySet", values: { name: nameWord, number: number } },
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
	if (nameWord) {
		attempts.push({
			query: nameQuery,
			description: { key: "matchNameOnly", values: { name: nameWord } },
		});
	}
	if (!nameWord && number && !total) {
		attempts.push({
			query: "number:" + number,
			description: { key: "matchNumberNoTotal", values: { number: number } },
		});
	}
	return attempts;
}

async function fetchCards(query) {
	const url = API_URL
		+ "?q=" + encodeURIComponent(query)
		+ "&orderBy=-set.releaseDate"
		+ "&pageSize=" + RESULTS_PAGE_SIZE
		+ "&select=" + CARD_FIELDS;
	let lastProblem = null;
	for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt++) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				const body = await response.json();
				return body.data || [];
			}
			lastProblem = new Error("Price database answered " + response.status);
		} catch (error) {
			lastProblem = error;   // no answer at all, e.g. a dropped connection
		}
		await wait(RETRY_DELAY_MS * attempt);   // wait a little longer after each failure
	}
	throw lastProblem;
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
