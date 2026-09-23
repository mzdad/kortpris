"use strict";

// ---------- Settings ----------

const API_URL = "https://api.pokemontcg.io/v2/cards";
// Only ask for the fields we show, so answers arrive faster on mobile data.
const CARD_FIELDS = "id,name,number,rarity,set,images,tcgplayer,cardmarket";
const RESULTS_PAGE_SIZE = 24;
// The free price database fails about half of its requests on the first try
// (measured September 2026), so every lookup is retried a few times.
const MAX_API_ATTEMPTS = 6;
const RETRY_DELAY_MS = 400;
// The Danish krone is pegged to the euro at this central rate, so the conversion stays accurate.
const DKK_PER_EUR = 7.46038;
// Photos are resized to this length (longest side) before reading the text:
// huge phone photos would be slow, and small ones read better when enlarged.
const OCR_TARGET_SIDE_PX = 2000;
// Tesseract rates every word 0-100. Low scores are usually smudges in the artwork, not text.
const MIN_WORD_CONFIDENCE = 55;
// On the name's line, words much smaller than the biggest one are small print, not the name.
const NAME_SIZE_RATIO = 0.7;
// Prices older than this get an "out of date" label.
const STALE_AFTER_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXAMPLE_CARD_IMAGE = "https://images.pokemontcg.io/base1/4_hires.png";

// Words printed near the name that are never part of it.
const NOT_NAME_WORDS = new Set([
	"BASIC", "STAGE", "EVOLVES", "HP", "POKEMON", "POKÉMON", "TRAINER", "ITEM", "SUPPORTER",
	"STADIUM", "TOOL", "LV", "LEVEL", "PUT", "THIS", "CARD", "ON", "THE", "OF", "AND",
	"ABILITY", "POWER", "WEAKNESS", "RESISTANCE", "RETREAT", "COST", "ILLUS", "NO",
]);

// TCGplayer splits prices by print version. These are the names it uses, in the order we show them.
const TCGPLAYER_VARIANTS = [
	["holofoil", "Holo"],
	["normal", "Normal"],
	["reverseHolofoil", "Reverse holo"],
	["1stEditionHolofoil", "1st edition holo"],
	["1stEditionNormal", "1st edition"],
	["unlimitedHolofoil", "Unlimited holo"],
	["unlimited", "Unlimited"],
];

// Cardmarket figures worth showing, in order. Zero means "no data", so those rows are skipped.
const CARDMARKET_ROWS = [
	["avg30", "30-day average"],
	["avg7", "7-day average"],
	["trendPrice", "Trend"],
	["averageSellPrice", "Average sale"],
	["lowPrice", "Cheapest listing"],
	["reverseHoloAvg30", "Reverse holo, 30-day average"],
	["reverseHoloTrend", "Reverse holo, trend"],
];

// Money is written the way the phone's language expects: "18.114,21 kr." in Danish.
const locale = navigator.language || "da-DK";
const euros = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
const kroner = new Intl.NumberFormat(locale, { style: "currency", currency: "DKK" });
const dollars = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" });

// ---------- Page elements ----------

const intro = document.getElementById("intro");
const exampleButton = document.getElementById("example-button");
const scanRow = document.getElementById("scan-row");
const photoThumb = document.getElementById("photo-thumb");
const statusText = document.getElementById("status");
const progress = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");
const searchForm = document.getElementById("search-form");
const nameInput = document.getElementById("name-input");
const numberInput = document.getElementById("number-input");
const searchButton = document.getElementById("search-button");
const detail = document.getElementById("detail");
const results = document.getElementById("results");
const resultsTitle = document.getElementById("results-title");
const resultsNote = document.getElementById("results-note");
const resultsGrid = document.getElementById("results-grid");
const cameraButton = document.getElementById("camera-button");
const libraryButton = document.getElementById("library-button");
const cameraInput = document.getElementById("camera-input");
const libraryInput = document.getElementById("library-input");

// Each new photo or search gets a number. When an older one finishes late,
// its answer is thrown away so it can't overwrite the newer one.
let latestScanId = 0;
let latestSearchId = 0;
let ocrWorkerPromise = null;
let photoUrl = null;
let cardsById = new Map();

// ---------- Buttons ----------

cameraButton.addEventListener("click", () => cameraInput.click());
libraryButton.addEventListener("click", () => libraryInput.click());
cameraInput.addEventListener("change", () => takeFileFrom(cameraInput));
libraryInput.addEventListener("change", () => takeFileFrom(libraryInput));

searchForm.addEventListener("submit", (event) => {
	event.preventDefault();   // stay on this page instead of reloading it
	searchForCard();
});

exampleButton.addEventListener("click", async () => {
	setStatus("Downloading the example card…");
	showProgress(null);
	try {
		const response = await fetch(EXAMPLE_CARD_IMAGE);
		const image = await response.blob();
		scanPhoto(image);
	} catch (error) {
		console.error(error);
		hideProgress();
		setStatus("Could not download the example card. Check the internet connection.", "error");
	}
});

resultsGrid.addEventListener("click", (event) => {
	const button = event.target.closest(".result");
	if (!button) return;
	showCardDetail(cardsById.get(button.dataset.cardId), true);
});

function takeFileFrom(input) {
	const file = input.files[0];
	input.value = "";   // so choosing the same photo twice still counts as a change
	if (file) scanPhoto(file);
}

// ---------- Step 1: read the photo ----------

async function scanPhoto(imageFile) {
	const scanId = ++latestScanId;
	latestSearchId++;   // cancel any search still running for the previous card
	intro.hidden = true;
	showPhoto(imageFile);
	clearResults();
	nameInput.value = "";
	numberInput.value = "";
	setStatus("Getting the text reader ready…");
	showProgress(null);
	searchButton.disabled = true;

	let reading = { name: "", number: "" };
	try {
		const canvas = await photoToCanvas(imageFile);
		reading = await readCardText(canvas);
	} catch (error) {
		console.error(error);
	}
	if (scanId !== latestScanId) return;

	searchButton.disabled = false;
	nameInput.value = reading.name;
	numberInput.value = reading.number;
	if (!reading.name && !reading.number) {
		hideProgress();
		setStatus("Couldn't read the card. Type the name and number below, or try a sharper photo in better light.", "error");
		return;
	}
	await searchForCard();
}

function showPhoto(imageFile) {
	if (photoUrl) URL.revokeObjectURL(photoUrl);   // free the memory used by the last photo
	photoUrl = URL.createObjectURL(imageFile);
	photoThumb.src = photoUrl;
	photoThumb.hidden = false;
	scanRow.classList.remove("no-photo");
}

async function photoToCanvas(imageFile) {
	// createImageBitmap also turns sideways phone photos the right way up.
	const bitmap = await createImageBitmap(imageFile);
	const scale = OCR_TARGET_SIDE_PX / Math.max(bitmap.width, bitmap.height);
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return canvas;
}

function getOcrWorker() {
	// The text reader downloads a few megabytes the first time, so it is created once and reused.
	if (!ocrWorkerPromise) {
		ocrWorkerPromise = Tesseract.createWorker("eng", 1, { logger: showOcrProgress });
		ocrWorkerPromise.catch(() => { ocrWorkerPromise = null; });   // allow a fresh try next photo
	}
	return ocrWorkerPromise;
}

function showOcrProgress(message) {
	// Tesseract reports what it is doing, plus how far along it is from 0 to 1.
	if (message.status === "recognizing text") {
		setStatus("Reading the card…");
		showProgress(message.progress);
	} else {
		setStatus("Getting the text reader ready (slow the first time)…");
	}
}

async function readCardText(canvas) {
	const worker = await getOcrWorker();
	// "blocks" gives every word with its size and position, which is how we find the name.
	const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
	return {
		name: guessCardName(result.data.blocks || []),
		number: guessCardNumber(result.data.text || ""),
	};
}

function guessCardName(blocks) {
	// The name is the biggest text on a card, so pick the line with the tallest real words.
	let bestName = "";
	let bestHeight = 0;
	for (const line of allLines(blocks)) {
		const words = nameWordsOnLine(line);
		if (words.length === 0) continue;
		const tallest = Math.max(...words.map((word) => word.height));
		const nameWords = words.filter((word) => word.height >= tallest * NAME_SIZE_RATIO);
		const name = nameWords.map((word) => word.text).join(" ");
		if (name.replace(/[^\p{L}]/gu, "").length < 3) continue;
		if (tallest > bestHeight) {
			bestHeight = tallest;
			bestName = name;
		}
	}
	return bestName;
}

function allLines(blocks) {
	const lines = [];
	for (const block of blocks) {
		for (const paragraph of block.paragraphs || []) {
			lines.push(...(paragraph.lines || []));
		}
	}
	return lines;
}

function nameWordsOnLine(line) {
	const kept = [];
	let skipNext = false;
	for (const word of line.words || []) {
		const text = cleanWord(word.text);
		const upper = text.toUpperCase();
		if (skipNext) {
			skipNext = false;
			continue;
		}
		// "Evolves from Charmeleon": the word after "from" is the previous Pokémon, not this one.
		if (upper === "FROM") {
			skipNext = true;
			continue;
		}
		if (!text || word.confidence < MIN_WORD_CONFIDENCE || NOT_NAME_WORDS.has(upper)) continue;
		kept.push({ text: text, height: word.bbox.y1 - word.bbox.y0 });
	}
	return kept;
}

function cleanWord(rawWord) {
	// Trim stray symbols from the edges, keeping the few that real names use:
	// Mr. Mime, Farfetch'd, Porygon-Z.
	const trimmed = rawWord.replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}.']+$/u, "");
	if (!/^\p{L}[\p{L}.'’-]*$/u.test(trimmed)) return "";   // digits or odd symbols: not a name
	if (trimmed.replace(/[^\p{L}]/gu, "").length < 2) return "";
	return trimmed;
}

function guessCardNumber(text) {
	// OCR often reads a zero as the letter O, so "4/1O2" is fixed to "4/102" first.
	const fixed = text.replace(/(?<=\d)[oO]|[oO](?=\d)/g, "0");
	// Collector numbers look like "4/102", "006/198" or "TG05/TG30".
	const match = fixed.match(/([A-Z]{0,3}\d{1,3})\s*\/\s*([A-Z]{0,3}\d{2,3})/);
	return match ? match[1] + "/" + match[2] : "";
}

// ---------- Step 2: find the card in the price database ----------

async function searchForCard() {
	const searchId = ++latestSearchId;
	const nameWord = longestWord(nameInput.value);
	const { number, total } = parseCollectorNumber(numberInput.value);
	if (!nameWord && !number) {
		hideProgress();
		setStatus("Type the card's name or its number to search.", "error");
		return;
	}

	clearResults();
	setStatus("Looking up prices…");
	showProgress(null);
	searchButton.disabled = true;
	try {
		// Try the most exact search first, then looser ones in case the photo was misread.
		for (const attempt of buildSearchAttempts(nameWord, number, total)) {
			const cards = await fetchCards(attempt.query);
			if (searchId !== latestSearchId) return;
			if (cards.length > 0) {
				hideProgress();
				setStatus(cards.length === 1 ? "Found it." : "Found " + cards.length + " possible cards. Tap yours.");
				showResults(cards, attempt.description);
				return;
			}
		}
		hideProgress();
		setStatus("No cards matched. Check the name and number against the card and search again.", "error");
	} catch (error) {
		console.error(error);
		if (searchId !== latestSearchId) return;
		hideProgress();
		setStatus("The price database didn't answer. Wait a moment, then press Search.", "error");
	} finally {
		if (searchId === latestSearchId) searchButton.disabled = false;
	}
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
	const nameQuery = 'name:"' + nameWord + '*"';
	const shownNumber = total ? number + "/" + total : number;
	const attempts = [];
	if (nameWord && number && total) {
		attempts.push({
			query: nameQuery + " number:" + number + " set.printedTotal:" + total,
			description: "Cards named “" + nameWord + "” with number " + shownNumber + ".",
		});
	}
	if (nameWord && number) {
		attempts.push({
			query: nameQuery + " number:" + number,
			description: "Cards named “" + nameWord + "” with number " + number + ", from any set.",
		});
	}
	if (number && total) {
		attempts.push({
			query: "number:" + number + " set.printedTotal:" + total,
			description: nameWord
				? "Nothing named “" + nameWord + "” has number " + shownNumber + ", so here is every card with that number. Check the name."
				: "Every card with number " + shownNumber + ".",
		});
	}
	if (nameWord) {
		attempts.push({
			query: nameQuery,
			description: "Every “" + nameWord + "” card, newest first. Add the number from the bottom corner to narrow it down.",
		});
	}
	if (!nameWord && number && !total) {
		attempts.push({
			query: "number:" + number,
			description: "Cards with number " + number + ", newest first. Add the name to narrow it down.",
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

// ---------- Step 3: show the matches and the prices ----------

function showResults(cards, description) {
	cardsById = new Map(cards.map((card) => [card.id, card]));
	if (cards.length === 1) {
		// Only one match: go straight to its prices, no need to pick.
		showCardDetail(cards[0], false);
		results.hidden = true;
		return;
	}
	resultsTitle.textContent = "Which one is yours?";
	resultsNote.textContent = description + (cards.length === RESULTS_PAGE_SIZE ? " Showing the first " + RESULTS_PAGE_SIZE + "." : "");
	resultsGrid.innerHTML = cards.map(resultButtonHtml).join("");
	results.hidden = false;
}

function resultButtonHtml(card) {
	return `
		<button class="result" type="button" data-card-id="${escapeHtml(card.id)}" aria-pressed="false">
			<img class="card-image" src="${escapeHtml(card.images.small)}" alt="" loading="lazy" width="245" height="342">
			<span class="result-name">${escapeHtml(card.name)}</span>
			<span class="result-set">${escapeHtml(card.set.name)}<br><span class="mono">${escapeHtml(collectorNumber(card))}</span></span>
		</button>`;
}

function clearResults() {
	detail.hidden = true;
	detail.innerHTML = "";
	results.hidden = true;
	resultsGrid.innerHTML = "";
	cardsById = new Map();
}

function showCardDetail(card, scrollToIt) {
	for (const button of resultsGrid.querySelectorAll(".result")) {
		button.setAttribute("aria-pressed", String(button.dataset.cardId === card.id));
	}
	detail.innerHTML = cardDetailHtml(card);
	detail.hidden = false;
	if (scrollToIt) {
		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		detail.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
	}
}

function cardDetailHtml(card) {
	const meta = [escapeHtml(card.set.name), `<span class="mono">${escapeHtml(collectorNumber(card))}</span>`];
	if (card.rarity) meta.push(escapeHtml(card.rarity));

	const worth = [cardmarketStatHtml(card.cardmarket), tcgplayerStatHtml(card.tcgplayer)].join("");
	const noPrices = worth === ""
		? `<p class="note">Nobody has sold this card on Cardmarket or TCGplayer recently, so there is no price yet.</p>`
		: "";
	const notYours = cardsById.size === 1
		? `<p class="fineprint">Not your card? Fix the name or number above and press Search.</p>`
		: "";

	return `
		<div class="detail-head">
			<img class="card-image" src="${escapeHtml(card.images.small)}" alt="${escapeHtml(card.name)}" width="245" height="342">
			<div>
				<h2 class="detail-name">${escapeHtml(card.name)}</h2>
				<p class="detail-meta">${meta.join(" · ")}</p>
			</div>
		</div>
		${worth ? `<div class="worth">${worth}</div>` : noPrices}
		${cardmarketTableHtml(card.cardmarket)}
		${tcgplayerTableHtml(card.tcgplayer)}
		<p class="fineprint">These are prices for ungraded cards. A scratched, bent or faded card sells for less.</p>
		${notYours}`;
}

function collectorNumber(card) {
	return card.set.printedTotal ? card.number + "/" + card.set.printedTotal : card.number;
}

// Cardmarket is Europe's biggest card shop, priced in euros.

function bestCardmarketPrice(cardmarket) {
	const prices = (cardmarket && cardmarket.prices) || {};
	if (prices.avg30 > 0) return { value: prices.avg30, label: "30-day average" };
	if (prices.trendPrice > 0) return { value: prices.trendPrice, label: "trend price" };
	if (prices.averageSellPrice > 0) return { value: prices.averageSellPrice, label: "average sale" };
	return null;
}

function cardmarketStatHtml(cardmarket) {
	const best = bestCardmarketPrice(cardmarket);
	if (!best) return "";
	return `
		<div class="stat">
			<span class="stat-label">Cardmarket · Europe</span>
			<span class="stat-value">${kroner.format(best.value * DKK_PER_EUR)}</span>
			<span class="stat-sub">${euros.format(best.value)} · ${best.label}</span>
		</div>`;
}

function cardmarketTableHtml(cardmarket) {
	if (!bestCardmarketPrice(cardmarket)) return "";
	const rows = CARDMARKET_ROWS
		.filter(([key]) => cardmarket.prices[key] > 0)
		.map(([key, label]) => {
			const value = cardmarket.prices[key];
			return `<tr><td>${label}</td><td>${euros.format(value)}</td><td>${kroner.format(value * DKK_PER_EUR)}</td></tr>`;
		});
	return `
		<div class="source">
			<h3>Cardmarket</h3>
			${updatedHtml(cardmarket.updatedAt)}
			<table class="price-table">
				<thead><tr><th>Price</th><th>Euro</th><th>Kroner</th></tr></thead>
				<tbody>${rows.join("")}</tbody>
			</table>
			${storeLinkHtml(cardmarket.url, "Open on Cardmarket")}
		</div>`;
}

// TCGplayer is the biggest card shop in the USA, priced in dollars.

function tcgplayerVariants(tcgplayer) {
	const prices = (tcgplayer && tcgplayer.prices) || {};
	const variants = [];
	for (const [key, label] of TCGPLAYER_VARIANTS) {
		const price = prices[key];
		if (price && (price.market > 0 || price.low > 0)) variants.push({ label, price });
	}
	return variants;
}

function tcgplayerStatHtml(tcgplayer) {
	const withMarket = tcgplayerVariants(tcgplayer).filter((variant) => variant.price.market > 0);
	if (withMarket.length === 0) return "";
	const first = withMarket[0];
	return `
		<div class="stat">
			<span class="stat-label">TCGplayer · USA</span>
			<span class="stat-value">${dollars.format(first.price.market)}</span>
			<span class="stat-sub">${first.label} · market price</span>
		</div>`;
}

function tcgplayerTableHtml(tcgplayer) {
	const variants = tcgplayerVariants(tcgplayer);
	if (variants.length === 0) return "";
	const rows = variants.map(({ label, price }) =>
		`<tr><td>${label}</td><td>${formatDollars(price.market)}</td><td>${formatDollars(price.low)}</td></tr>`);
	return `
		<div class="source">
			<h3>TCGplayer</h3>
			${updatedHtml(tcgplayer.updatedAt)}
			<table class="price-table">
				<thead><tr><th>Version</th><th>Market</th><th>Lowest</th></tr></thead>
				<tbody>${rows.join("")}</tbody>
			</table>
			${storeLinkHtml(tcgplayer.url, "Open on TCGplayer")}
		</div>`;
}

function formatDollars(value) {
	return value > 0 ? dollars.format(value) : "–";
}

function updatedHtml(updatedAt) {
	// The database writes dates as "2026/07/01".
	const parts = String(updatedAt || "").split("/").map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) return "";
	const date = new Date(parts[0], parts[1] - 1, parts[2]);
	const daysOld = Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);
	const shownDate = date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
	const staleChip = daysOld > STALE_AFTER_DAYS ? `<span class="chip">${ageInWords(daysOld)} old</span>` : "";
	return `<p class="updated"><span>Prices from ${shownDate}</span>${staleChip}</p>`;
}

function ageInWords(days) {
	if (days < 60) return Math.round(days / 7) + " weeks";
	return Math.round(days / 30) + " months";
}

function storeLinkHtml(url, text) {
	if (!/^https:\/\//.test(url || "")) return "";
	return `<a class="store-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${text} ↗</a>`;
}

// ---------- Small helpers ----------

function setStatus(text, tone) {
	statusText.textContent = text;
	statusText.classList.toggle("error", tone === "error");
}

function showProgress(fraction) {
	// A number from 0 to 1 fills the bar that far. null means "busy, but no idea how long".
	progress.hidden = false;
	progress.classList.toggle("indeterminate", fraction === null);
	progressBar.style.width = fraction === null ? "" : Math.round(fraction * 100) + "%";
}

function hideProgress() {
	progress.hidden = true;
}

function escapeHtml(text) {
	// Text from the database is shown as text, never run as page code.
	return String(text ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
