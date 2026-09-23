"use strict";

// ---------- Settings ----------

// The Danish krone is pegged to the euro at this central rate, so the conversion stays accurate.
const DKK_PER_EUR = 7.46038;
// Prices older than this get an "out of date" label.
const STALE_AFTER_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXAMPLE_CARD_IMAGE = "https://images.pokemontcg.io/base1/4_hires.png";
// Where the phone remembers the chosen language between visits.
const LANGUAGE_STORAGE_KEY = "kortpris.language";

// TCGplayer splits prices by print version: [its name for the version, our text key].
const TCGPLAYER_VARIANTS = [
	["holofoil", "holofoil"],
	["normal", "normal"],
	["reverseHolofoil", "reverseHolofoil"],
	["1stEditionHolofoil", "firstEditionHolofoil"],
	["1stEditionNormal", "firstEditionNormal"],
	["unlimitedHolofoil", "unlimitedHolofoil"],
	["unlimited", "unlimited"],
];

// Cardmarket figures worth showing, in order. Each name doubles as its text key in strings.js.
// Zero means "no data", so those rows are skipped.
const CARDMARKET_ROWS = [
	"avg30", "avg7", "trendPrice", "averageSellPrice", "lowPrice", "reverseHoloAvg30", "reverseHoloTrend",
];

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
const resultsNote = document.getElementById("results-note");
const resultsGrid = document.getElementById("results-grid");
const cameraButton = document.getElementById("camera-button");
const libraryButton = document.getElementById("library-button");
const cameraInput = document.getElementById("camera-input");
const libraryInput = document.getElementById("library-input");
const languageButtons = document.querySelectorAll("[data-language]");
const viewButtons = document.querySelectorAll("[data-view]");
const scanView = document.getElementById("scan-view");
const collectionView = document.getElementById("collection-view");
const collectionCount = document.getElementById("collection-count");
const collectionSummary = document.getElementById("collection-summary");
const collectionList = document.getElementById("collection-list");
const notice = document.getElementById("notice");
const claudeState = document.getElementById("claude-state");
const claudeForm = document.getElementById("claude-form");
const claudeKeyInput = document.getElementById("claude-key-input");
const claudeRemoveButton = document.getElementById("claude-remove");
const claudeMessage = document.getElementById("claude-message");
const collectionWhere = document.getElementById("collection-where");
const accountPanel = document.getElementById("account-panel");
const signedOutPart = document.getElementById("signed-out");
const signedInPart = document.getElementById("signed-in");
const accountModeButtons = document.querySelectorAll("[data-account-mode]");
const accountForm = document.getElementById("account-form");
const usernameInput = document.getElementById("username-input");
const usernameHint = document.getElementById("username-hint");
const passwordInput = document.getElementById("password-input");
const passwordAgainInput = document.getElementById("password-again-input");
const showPasswordButton = document.getElementById("show-password");
const createOnly = document.getElementById("create-only");
const strengthMeter = document.getElementById("strength-meter");
const passwordFeedback = document.getElementById("password-feedback");
const accountSubmit = document.getElementById("account-submit");
const accountNameText = document.getElementById("account-name");
const signOutButton = document.getElementById("sign-out");
const phoneCardsOffer = document.getElementById("phone-cards-offer");
const phoneCardsText = document.getElementById("phone-cards-text");
const moveCardsButton = document.getElementById("move-cards");
const accountMessageText = document.getElementById("account-message");

// ---------- What is on screen right now ----------
// Kept as plain data so everything can be redrawn when the language changes.

let language = startLanguage();
let money = makeMoneyFormats(language);
let statusMessage = { key: "statusIdle", values: {}, tone: "" };
let shownCards = [];              // the cards from the latest search
let shownDescription = null;      // which kind of search found them: { key, values }
let selectedCardId = null;        // the card whose prices are open
let bestMatchId = null;           // the card that looks most like the photo
let saveFailed = false;           // the browser refused to save "My cards"
let refreshingPrices = false;     // "Update prices" is busy
let refreshMessage = null;        // what the last price update said: a text key, or null
let noticeKey = null;             // why Claude couldn't read the last photo: a text key, or null
let claudeMessageKey = null;      // what the Claude settings last said: a text key, or null
let accountMode = "sign-in";      // the account form signs in, or creates an account ("create")
let accountBusy = false;          // waiting for Firebase to sign in or create an account
let accountsReady = false;        // Firebase has started
let accountMessage = null;        // { key, values, tone } shown under the account form, or null
let passwordsShown = false;       // the password boxes show their letters
let stopWatchingCards = null;     // stops listening for the signed-in account's cards

// Each new photo or search gets a number. When an older one finishes late,
// its answer is thrown away so it can't overwrite the newer one.
let latestScanId = 0;
let latestSearchId = 0;
let photoUrl = null;
// The latest photo (shrunk) and where its text was, for comparing cards' looks.
// Stays null until a photo is taken, so typed searches work as they always did.
let lastPhoto = null;

applyLanguage();

if (accountsAvailable()) {
	startAccounts(handleAccountChange).then(
		() => {
			accountsReady = true;
			renderAccount();
		},
		(error) => {
			console.error(error);
			setAccountMessage({ key: "accountsOffline", values: {} }, "error");
		},
	);
}

// ---------- Language ----------

function startLanguage() {
	// Use the language picked last time; otherwise Danish on Danish phones, English elsewhere.
	const saved = readStorage(LANGUAGE_STORAGE_KEY);
	if (saved && STRINGS[saved]) return saved;
	return (navigator.language || "").toLowerCase().startsWith("da") ? "da" : "en";
}

function t(key, values = {}) {
	// Look up a text in the current language and fill in its {markers}.
	const text = STRINGS[language][key] ?? STRINGS.en[key] ?? key;
	return text.replace(/\{(\w+)\}/g, (marker, name) => values[name] ?? marker);
}

function makeMoneyFormats(lang) {
	const locale = NUMBER_LOCALES[lang];
	return {
		locale: locale,
		euros: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }),
		kroner: new Intl.NumberFormat(locale, { style: "currency", currency: "DKK" }),
		dollars: new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }),
	};
}

function applyLanguage() {
	document.documentElement.lang = language;
	money = makeMoneyFormats(language);

	// Fixed text in index.html is marked with the key of its translation.
	for (const element of document.querySelectorAll("[data-text]")) element.textContent = t(element.dataset.text);
	for (const element of document.querySelectorAll("[data-placeholder]")) element.placeholder = t(element.dataset.placeholder);
	for (const element of document.querySelectorAll("[data-label]")) element.setAttribute("aria-label", t(element.dataset.label));
	for (const element of document.querySelectorAll("[data-alt]")) element.alt = t(element.dataset.alt);
	for (const button of languageButtons) button.setAttribute("aria-pressed", String(button.dataset.language === language));

	// Text the app wrote itself is drawn again from the data it came from.
	showStatus();
	showNotice();
	renderResults();
	renderCollection();
	renderClaudeSettings();
	renderAccount();
}

for (const button of languageButtons) {
	button.addEventListener("click", () => {
		language = button.dataset.language;
		writeStorage(LANGUAGE_STORAGE_KEY, language);
		applyLanguage();
	});
}

// ---------- Buttons ----------

cameraButton.addEventListener("click", () => {
	showView("scan");
	cameraInput.click();
});
libraryButton.addEventListener("click", () => {
	showView("scan");
	libraryInput.click();
});
cameraInput.addEventListener("change", () => takeFileFrom(cameraInput));
libraryInput.addEventListener("change", () => takeFileFrom(libraryInput));

searchForm.addEventListener("submit", (event) => {
	event.preventDefault();   // stay on this page instead of reloading it
	searchForCard();
});

exampleButton.addEventListener("click", async () => {
	setStatus("downloadingExample");
	showProgress(null);
	try {
		const response = await fetch(EXAMPLE_CARD_IMAGE);
		const image = await response.blob();
		scanPhoto(image);
	} catch (error) {
		console.error(error);
		hideProgress();
		setStatus("exampleFailed", {}, "error");
	}
});

resultsGrid.addEventListener("click", (event) => {
	const button = event.target.closest(".result");
	if (!button) return;
	selectedCardId = button.dataset.cardId;
	renderResults();
	scrollToDetail();
});

detail.addEventListener("click", (event) => {
	if (!event.target.closest("[data-action='add-to-collection']")) return;
	const card = shownCards.find((shown) => shown.id === selectedCardId);
	if (!card || !collectionReady()) return;
	saveFailed = !addToCollection(card);
	renderResults();
	renderCollection();
});

for (const button of viewButtons) {
	button.addEventListener("click", () => showView(button.dataset.view));
}

claudeForm.addEventListener("submit", (event) => {
	event.preventDefault();   // stay on this page instead of reloading it
	const key = claudeKeyInput.value.trim();
	if (!looksLikeClaudeKey(key)) {
		claudeMessageKey = "claudeKeyShape";
	} else if (!saveClaudeKey(key)) {
		claudeMessageKey = "claudeSaveFailed";
	} else {
		claudeKeyInput.value = "";   // don't leave the key showing on screen
		claudeMessageKey = "claudeSaved";
	}
	renderClaudeSettings();
});

claudeRemoveButton.addEventListener("click", () => {
	forgetClaudeKey();
	claudeKeyInput.value = "";
	claudeMessageKey = "claudeRemoved";
	renderClaudeSettings();
});

for (const button of accountModeButtons) {
	button.addEventListener("click", () => {
		accountMode = button.dataset.accountMode;
		setAccountMessage(null);
		if (accountMode === "create") {
			// The password checker is big, so it is only fetched when someone wants an account.
			loadPasswordChecker().then(renderAccount, () => {
				setAccountMessage({ key: "passwordCheckerFailed", values: {} }, "error");
			});
		}
		renderAccount();
	});
}

usernameInput.addEventListener("input", () => {
	if (accountMode === "create") showPasswordStrength();
});
passwordInput.addEventListener("input", () => {
	if (accountMode === "create") showPasswordStrength();
});

showPasswordButton.addEventListener("click", () => {
	passwordsShown = !passwordsShown;
	renderAccount();
});

accountForm.addEventListener("submit", async (event) => {
	event.preventDefault();   // stay on this page instead of reloading it
	if (accountBusy || !accountsReady) return;
	const username = cleanUsername(usernameInput.value);
	const password = passwordInput.value;
	const creating = accountMode === "create";

	// Catch what we can here, before asking Firebase.
	let problem = null;
	if (!isValidUsername(username)) {
		problem = { key: "usernameInvalid", values: {} };
	} else if (password === "") {
		problem = { key: "needPassword", values: {} };
	} else if (creating) {
		const check = checkNewPassword(password, username);
		if (!check.ok) problem = { key: check.problem, values: check.values };
		else if (password !== passwordAgainInput.value) problem = { key: "passwordsDiffer", values: {} };
	}
	if (problem) {
		setAccountMessage(problem, "error");
		return;
	}

	accountBusy = true;
	setAccountMessage(null);
	renderAccount();
	try {
		if (creating) {
			await createAccount(username, password);
			setAccountMessage({ key: "accountCreated", values: { name: username } }, "");
		} else {
			await signIn(username, password);
		}
		// Don't leave passwords sitting in the boxes after they've been used.
		passwordInput.value = "";
		passwordAgainInput.value = "";
	} catch (error) {
		console.error(error);
		setAccountMessage(accountProblem(error), "error");
	}
	accountBusy = false;
	renderAccount();
});

signOutButton.addEventListener("click", async () => {
	try {
		await signOutOfAccount();
		setAccountMessage(null);
	} catch (error) {
		console.error(error);
		setAccountMessage(accountProblem(error), "error");
	}
});

moveCardsButton.addEventListener("click", () => {
	if (!collectionReady()) return;
	movePhoneCardsIntoAccount();
	setAccountMessage({ key: "cardsMoved", values: {} }, "");
	renderCollection();
	renderResults();
	renderAccount();
});

collectionList.addEventListener("click", (event) => {
	const button = event.target.closest("[data-action]");
	if (!button || !collectionReady()) return;
	changeSavedCount(button.dataset.cardId, button.dataset.action === "more" ? 1 : -1);
	renderCollection();
	renderResults();   // the open card's "You have 2" line may have changed
});

collectionSummary.addEventListener("click", async (event) => {
	if (!event.target.closest("[data-action='refresh']") || refreshingPrices) return;
	refreshingPrices = true;
	refreshMessage = null;
	renderCollection();
	try {
		await refreshCollectionPrices();
		refreshMessage = "pricesUpdated";
	} catch (error) {
		console.error(error);
		refreshMessage = "refreshFailed";
	}
	refreshingPrices = false;
	renderCollection();
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
	lastPhoto = null;
	clearResults();
	nameInput.value = "";
	numberInput.value = "";
	searchButton.disabled = true;
	setNotice(null);

	// With a saved API key, Claude reads the card. If that fails for any reason,
	// the built-in reader takes over, and a notice says why.
	let reading = null;
	if (claudeKey()) {
		setStatus("claudeReading");
		showProgress(null);
		try {
			const answer = await readCardWithClaude(imageFile);
			if (scanId !== latestScanId) return;
			if (!answer.isPokemonCard) {
				searchButton.disabled = false;
				hideProgress();
				setStatus("claudeNotACard", {}, "error");
				return;
			}
			reading = {
				name: answer.name,
				number: answer.number,
				setName: answer.setName,
				photo: await photoForLooks(imageFile),
				textArea: null,
			};
		} catch (error) {
			if (scanId !== latestScanId) return;
			setNotice(await claudeProblem(error));
		}
	}
	if (!reading) reading = await readWithBuiltInReader(imageFile, scanId);
	if (scanId !== latestScanId) return;

	searchButton.disabled = false;
	if (reading.photo) {
		lastPhoto = { picture: reading.photo, textArea: reading.textArea, setName: reading.setName || "" };
	}
	nameInput.value = reading.name;
	numberInput.value = reading.number;
	if (!reading.name && !reading.number) {
		hideProgress();
		setStatus("readFailed", {}, "error");
		return;
	}
	await searchForCard();
}

async function readWithBuiltInReader(imageFile, scanId) {
	try {
		return await readCardPhoto(imageFile, (stage, fraction) => {
			if (scanId !== latestScanId) return;
			if (stage === "reading") {
				setStatus("reading");
				showProgress(fraction);
			} else if (stage === "loading") {
				setStatus("readerStartingSlow");
				showProgress(null);
			} else {
				setStatus("readerStarting");
				showProgress(null);
			}
		});
	} catch (error) {
		console.error(error);
		return { name: "", number: "" };
	}
}

async function photoForLooks(imageFile) {
	// The same shrunk copy the built-in reader makes, for comparing cards' looks.
	const original = await createImageBitmap(imageFile);
	const photo = shrinkPhoto(original);
	original.close();
	return photo;
}

function showPhoto(imageFile) {
	if (photoUrl) URL.revokeObjectURL(photoUrl);   // free the memory used by the last photo
	photoUrl = URL.createObjectURL(imageFile);
	photoThumb.src = photoUrl;
	photoThumb.hidden = false;
	scanRow.classList.remove("no-photo");
}

// ---------- Step 2: find the card in the price database ----------

async function searchForCard() {
	const searchId = ++latestSearchId;
	if (!canSearch(nameInput.value, numberInput.value)) {
		hideProgress();
		setStatus("needNameOrNumber", {}, "error");
		return;
	}

	clearResults();
	setStatus("lookingUp");
	showProgress(null);
	searchButton.disabled = true;
	try {
		const found = await findCards(nameInput.value, numberInput.value, lastPhoto !== null);
		if (searchId !== latestSearchId) return;   // a newer photo or search took over
		if (found.cards.length === 0) {
			hideProgress();
			setStatus("noMatch", {}, "error");
		} else if (found.cards.length === 1) {
			hideProgress();
			setStatus("foundOne");
			showResults(found.cards, found.description, found.cards[0].id, null);
		} else if (!lastPhoto) {
			hideProgress();
			setStatus("foundMany", { count: found.cards.length });
			showResults(found.cards, found.description, null, null);
		} else {
			// Several cards fit the text: let the photo pick the one that looks most like it.
			setStatus("comparingPictures");
			const ranked = await rankByLook(lastPhoto.picture, lastPhoto.textArea, found.cards);
			if (searchId !== latestSearchId) return;
			hideProgress();
			let cards = ranked.map((entry) => entry.card);
			// Only trust looks alone when the reader also found where the card sits in the photo.
			let clear = lastPhoto.textArea !== null && isClearWinner(ranked);
			// Claude also names the set. If exactly one candidate is from that set, that settles it.
			const fromSet = cards.filter((card) => sameSetName(card.set.name, lastPhoto.setName));
			if (fromSet.length === 1) {
				cards = [fromSet[0], ...cards.filter((card) => card !== fromSet[0])];
				clear = true;
			}
			cards = cards.slice(0, RESULTS_PAGE_SIZE);
			const best = cards[0].id;
			if (clear) {
				setStatus("bestMatchOpened");
				showResults(cards, found.description, best, best);
			} else {
				setStatus("foundManyByLook", { count: cards.length });
				showResults(cards, found.description, null, best);
			}
		}
	} catch (error) {
		console.error(error);
		if (searchId !== latestSearchId) return;
		hideProgress();
		setStatus("apiDown", {}, "error");
	} finally {
		if (searchId === latestSearchId) searchButton.disabled = false;
	}
}

// ---------- Step 3: show the matches and the prices ----------

// openId: the card whose prices open straight away (or null to let the viewer pick).
// bestId: the card to mark "Best match" (or null).
function showResults(cards, description, openId, bestId) {
	shownCards = cards;
	shownDescription = description;
	selectedCardId = openId;
	bestMatchId = bestId;
	renderResults();
}

function clearResults() {
	shownCards = [];
	shownDescription = null;
	selectedCardId = null;
	bestMatchId = null;
	renderResults();
}

function renderResults() {
	// Draws the grid of matches and the open card's prices from the data above.
	const selectedCard = shownCards.find((card) => card.id === selectedCardId);
	detail.hidden = !selectedCard;
	detail.innerHTML = selectedCard ? cardDetailHtml(selectedCard) : "";

	results.hidden = shownCards.length < 2;
	if (shownCards.length < 2) {
		resultsGrid.innerHTML = "";
		return;
	}
	let note = t(shownDescription.key, shownDescription.values);
	if (shownCards.length === RESULTS_PAGE_SIZE) note += t("showingFirst", { count: RESULTS_PAGE_SIZE });
	resultsNote.textContent = note;
	resultsGrid.innerHTML = shownCards.map(resultButtonHtml).join("");
}

function resultButtonHtml(card) {
	const badge = card.id === bestMatchId ? `<span class="badge">${t("bestMatch")}</span>` : "";
	// Loaded the same way matcher.js loads it, so each picture downloads only once.
	return `
		<button class="result" type="button" data-card-id="${escapeHtml(card.id)}" aria-pressed="${card.id === selectedCardId}">
			<img class="card-image" src="${escapeHtml(readablePictureUrl(card.images.small))}" alt="" loading="lazy" crossorigin="anonymous" width="245" height="342">
			${badge}
			<span class="result-name">${escapeHtml(card.name)}</span>
			<span class="result-set">${escapeHtml(card.set.name)}<br><span class="mono">${escapeHtml(collectorNumber(card))}</span></span>
		</button>`;
}

function scrollToDetail() {
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	detail.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function cardDetailHtml(card) {
	const meta = [escapeHtml(card.set.name), `<span class="mono">${escapeHtml(collectorNumber(card))}</span>`];
	if (card.rarity) meta.push(escapeHtml(card.rarity));

	const worth = [cardmarketStatHtml(card.cardmarket), tcgplayerStatHtml(card.tcgplayer)].join("");
	const noPrices = worth === "" ? `<p class="note">${t("noPrices")}</p>` : "";
	const notYours = shownCards.length === 1 ? `<p class="fineprint">${t("notYours")}</p>` : "";

	const owned = savedCount(card.id);
	const ownedNote = owned > 0 ? `<p class="own-note">${t("inCollection", { count: owned })}</p>` : "";
	const saveProblem = saveFailed ? `<p class="status error">${t("storageBlocked")}</p>` : "";
	let addText = owned > 0 ? "addAnother" : "addToCollection";
	if (!collectionReady()) addText = "loadingAccountCards";
	const own = `
		<div class="own">
			<button type="button" class="button secondary" data-action="add-to-collection" ${collectionReady() ? "" : "disabled"}>
				${t(addText)}
			</button>
			${ownedNote}
			${saveProblem}
		</div>`;

	return `
		<div class="detail-head">
			<img class="card-image" src="${escapeHtml(readablePictureUrl(card.images.small))}" alt="${escapeHtml(card.name)}" crossorigin="anonymous" width="245" height="342">
			<div>
				<h2 class="detail-name">${escapeHtml(card.name)}</h2>
				<p class="detail-meta">${meta.join(" · ")}</p>
			</div>
		</div>
		${worth ? `<div class="worth">${worth}</div>` : noPrices}
		${own}
		${cardmarketTableHtml(card.cardmarket)}
		${tcgplayerTableHtml(card.tcgplayer)}
		<p class="fineprint">${t("ungraded")}</p>
		${notYours}`;
}

function collectorNumber(card) {
	return card.set.printedTotal ? card.number + "/" + card.set.printedTotal : card.number;
}

// Cardmarket is Europe's biggest card shop, priced in euros.

function bestCardmarketPrice(cardmarket) {
	const prices = (cardmarket && cardmarket.prices) || {};
	for (const key of ["avg30", "trendPrice", "averageSellPrice"]) {
		if (prices[key] > 0) return { value: prices[key], key: key };
	}
	return null;
}

function cardmarketStatHtml(cardmarket) {
	const best = bestCardmarketPrice(cardmarket);
	if (!best) return "";
	return `
		<div class="stat">
			<span class="stat-label">${t("cardmarketStat")}</span>
			<span class="stat-value">${money.kroner.format(best.value * DKK_PER_EUR)}</span>
			<span class="stat-sub">${money.euros.format(best.value)} · ${t(best.key)}</span>
		</div>`;
}

function cardmarketTableHtml(cardmarket) {
	if (!bestCardmarketPrice(cardmarket)) return "";
	const rows = CARDMARKET_ROWS
		.filter((key) => cardmarket.prices[key] > 0)
		.map((key) => {
			const value = cardmarket.prices[key];
			return `<tr><td>${t(key)}</td><td>${money.euros.format(value)}</td><td>${money.kroner.format(value * DKK_PER_EUR)}</td></tr>`;
		});
	return `
		<div class="source">
			<h3>Cardmarket</h3>
			${updatedHtml(cardmarket.updatedAt)}
			<table class="price-table">
				<thead><tr><th>${t("cardmarketPrice")}</th><th>${t("euro")}</th><th>${t("kroner")}</th></tr></thead>
				<tbody>${rows.join("")}</tbody>
			</table>
			${storeLinkHtml(cardmarket.url, t("openCardmarket"))}
		</div>`;
}

// TCGplayer is the biggest card shop in the USA, priced in dollars.

function tcgplayerVariants(tcgplayer) {
	const prices = (tcgplayer && tcgplayer.prices) || {};
	const variants = [];
	for (const [apiName, textKey] of TCGPLAYER_VARIANTS) {
		const price = prices[apiName];
		if (price && (price.market > 0 || price.low > 0)) variants.push({ label: t(textKey), textKey, price });
	}
	return variants;
}

function tcgplayerStatHtml(tcgplayer) {
	const withMarket = tcgplayerVariants(tcgplayer).filter((variant) => variant.price.market > 0);
	if (withMarket.length === 0) return "";
	const first = withMarket[0];
	return `
		<div class="stat">
			<span class="stat-label">${t("tcgplayerStat")}</span>
			<span class="stat-value">${money.dollars.format(first.price.market)}</span>
			<span class="stat-sub">${first.label} · ${t("marketPrice")}</span>
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
				<thead><tr><th>${t("tcgplayerVersion")}</th><th>${t("tcgplayerMarket")}</th><th>${t("tcgplayerLowest")}</th></tr></thead>
				<tbody>${rows.join("")}</tbody>
			</table>
			${storeLinkHtml(tcgplayer.url, t("openTcgplayer"))}
		</div>`;
}

function formatDollars(value) {
	return value > 0 ? money.dollars.format(value) : "–";
}

function updatedHtml(updatedAt) {
	// The database writes dates as "2026/07/01".
	const parts = String(updatedAt || "").split("/").map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) return "";
	const date = new Date(parts[0], parts[1] - 1, parts[2]);
	const daysOld = Math.floor((Date.now() - date.getTime()) / MS_PER_DAY);
	const shownDate = date.toLocaleDateString(money.locale, { day: "numeric", month: "short", year: "numeric" });
	const staleChip = daysOld > STALE_AFTER_DAYS ? `<span class="chip">${ageInWords(daysOld)}</span>` : "";
	return `<p class="updated"><span>${t("pricesFrom", { date: shownDate })}</span>${staleChip}</p>`;
}

function ageInWords(days) {
	if (days < 60) return t("weeksOld", { count: Math.round(days / 7) });
	return t("monthsOld", { count: Math.round(days / 30) });
}

function storeLinkHtml(url, text) {
	if (!/^https:\/\//.test(url || "")) return "";
	return `<a class="store-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${text} ↗</a>`;
}

// ---------- My cards ----------

function showView(view) {
	scanView.hidden = view !== "scan";
	collectionView.hidden = view !== "collection";
	for (const button of viewButtons) button.setAttribute("aria-pressed", String(button.dataset.view === view));
	if (view === "collection") renderCollection();
}

function renderCollection() {
	const totals = collectionTotals();
	collectionCount.textContent = totals.cards > 0 ? totals.cards : "";
	collectionWhere.textContent = accountName ? t("savedInAccount", { name: accountName }) : t("savedOnPhone");
	if (!collectionReady()) {
		collectionSummary.innerHTML = `<p class="note">${t("loadingAccountCards")}</p>`;
		collectionList.innerHTML = "";
		return;
	}
	const saveProblem = accountSaveProblem
		? `<p class="status error">${t("notSaved")} ${t(accountSaveProblem.key, accountSaveProblem.values)}</p>`
		: "";
	collectionSummary.innerHTML = saveProblem + collectionSummaryHtml(totals);
	// Most valuable first; cards without a Cardmarket price at the end.
	const sorted = [...collection].sort((a, b) => savedValue(b) - savedValue(a));
	collectionList.innerHTML = sorted.map(savedCardHtml).join("");
}

function savedValue(entry) {
	return entry.priceEur > 0 ? entry.count * entry.priceEur * DKK_PER_EUR : -1;
}

function collectionSummaryHtml(totals) {
	if (totals.cards === 0) return `<p class="note">${t("collectionEmpty")}</p>`;
	const countText = totals.cards === 1 ? t("cardCountOne") : t("cardCount", { count: totals.cards });
	const unpriced = totals.unpriced > 0 ? `<p class="fineprint">${t("notInTotal", { count: totals.unpriced })}</p>` : "";
	const message = refreshMessage
		? `<span class="${refreshMessage === "refreshFailed" ? "status error" : "note"}">${t(refreshMessage)}</span>`
		: "";
	return `
		<span class="stat-label">${t("totalValue")}</span>
		<span class="total-value">${money.kroner.format(totals.kroner)}</span>
		<span class="stat-sub">${countText} · ${t("valueBasis")}</span>
		${updatedHtml(totals.oldestUpdate)}
		${unpriced}
		<div class="refresh-row">
			<button type="button" class="button secondary" data-action="refresh" ${refreshingPrices ? "disabled" : ""}>
				${t(refreshingPrices ? "updatingPrices" : "updatePrices")}
			</button>
			${message}
		</div>`;
}

function savedCardHtml(entry) {
	let each = t("noPrice");
	if (entry.priceEur > 0) each = money.kroner.format(entry.priceEur * DKK_PER_EUR);
	else if (entry.priceUsd > 0) each = money.dollars.format(entry.priceUsd) + " (TCGplayer)";
	const lineTotal = entry.priceEur > 0 && entry.count > 1
		? " · " + t("allOfThem", { price: money.kroner.format(savedValue(entry)) })
		: "";
	const id = escapeHtml(entry.id);
	return `
		<li class="saved-card">
			<img class="card-image" src="${escapeHtml(readablePictureUrl(entry.image))}" alt="" loading="lazy" crossorigin="anonymous" width="245" height="342">
			<div class="saved-info">
				<span class="saved-name">${escapeHtml(entry.name)}</span>
				<span class="saved-meta">${escapeHtml(entry.setName)} · <span class="mono">${escapeHtml(entry.number)}</span></span>
				<span class="saved-price">${t("each", { price: each })}${lineTotal}</span>
			</div>
			<div class="stepper">
				<button type="button" data-action="fewer" data-card-id="${id}" aria-label="${t("oneFewer")}">−</button>
				<span class="stepper-count">${entry.count}</span>
				<button type="button" data-action="more" data-card-id="${id}" aria-label="${t("oneMore")}">+</button>
			</div>
		</li>`;
}

// ---------- Accounts ----------

function handleAccountChange(username) {
	if (stopWatchingCards) {
		stopWatchingCards();
		stopWatchingCards = null;
	}
	if (username) {
		useAccountCollection(username);
		stopWatchingCards = watchAccountCards(
			username,
			(cards) => {
				useAccountCards(cards);
				renderCollection();
				renderResults();
				renderAccount();
			},
			(error) => {
				console.error(error);
				setAccountMessage(accountProblem(error), "error");
			},
		);
	} else {
		usePhoneCollection();
	}
	renderAccount();
	renderCollection();
	renderResults();
}

function renderAccount() {
	accountPanel.hidden = !accountsAvailable();
	if (accountPanel.hidden) return;
	const signedIn = accountName !== null;
	signedOutPart.hidden = signedIn;
	signedInPart.hidden = !signedIn;

	if (signedIn) {
		accountNameText.textContent = accountName;
		// Cards saved on this phone before signing in can be moved into the account.
		const onPhone = accountCardsLoaded ? phoneCardCount() : 0;
		phoneCardsOffer.hidden = onPhone === 0;
		phoneCardsText.textContent = onPhone === 1 ? t("phoneCardsOne") : t("phoneCards", { count: onPhone });
	} else {
		const creating = accountMode === "create";
		for (const button of accountModeButtons) {
			button.setAttribute("aria-pressed", String(button.dataset.accountMode === accountMode));
		}
		createOnly.hidden = !creating;
		usernameHint.hidden = !creating;
		// Tells the phone's password manager whether to fill in a saved password or offer a new one.
		passwordInput.autocomplete = creating ? "new-password" : "current-password";
		passwordInput.type = passwordsShown ? "text" : "password";
		passwordAgainInput.type = passwordsShown ? "text" : "password";
		showPasswordButton.textContent = t(passwordsShown ? "hidePassword" : "showPassword");
		showPasswordButton.setAttribute("aria-pressed", String(passwordsShown));
		let submitText = creating ? "createAccount" : "signIn";
		if (accountBusy) submitText = creating ? "creatingAccount" : "signingIn";
		accountSubmit.textContent = t(submitText);
		accountSubmit.disabled = accountBusy || !accountsReady;
		if (creating) showPasswordStrength();
	}
	showAccountMessage();
}

function showPasswordStrength() {
	const password = passwordInput.value;
	if (password === "") {
		passwordFeedback.textContent = t("passwordTip");
		setStrengthBars(0, "");
		return;
	}
	const check = checkNewPassword(password, cleanUsername(usernameInput.value));
	passwordFeedback.textContent = check.ok ? t("passwordStrong") : t(check.problem, check.values);
	const bars = check.score === null ? 1 : Math.max(1, check.score);
	setStrengthBars(bars, check.ok ? "strong" : "weak");
}

function setStrengthBars(filled, level) {
	strengthMeter.dataset.level = level;
	[...strengthMeter.children].forEach((bar, index) => bar.classList.toggle("filled", index < filled));
}

function setAccountMessage(message, tone = "") {
	accountMessage = message ? { ...message, tone: tone } : null;
	showAccountMessage();
}

function showAccountMessage() {
	accountMessageText.textContent = accountMessage ? t(accountMessage.key, accountMessage.values) : "";
	accountMessageText.classList.toggle("error", accountMessage !== null && accountMessage.tone === "error");
	accountMessageText.hidden = accountMessage === null;
}

// ---------- Read cards with Claude ----------

function renderClaudeSettings() {
	const on = claudeKey() !== "";
	claudeState.textContent = t(on ? "claudeOn" : "claudeOff");
	claudeState.classList.toggle("on", on);
	claudeRemoveButton.hidden = !on;
	claudeMessage.textContent = claudeMessageKey ? t(claudeMessageKey) : "";
	claudeMessage.classList.toggle("error", claudeMessageKey === "claudeKeyShape" || claudeMessageKey === "claudeSaveFailed");
}

function sameSetName(a, b) {
	return lettersOnly(a || "") !== "" && lettersOnly(a || "") === lettersOnly(b || "");
}

function setNotice(key) {
	noticeKey = key;
	showNotice();
}

function showNotice() {
	notice.hidden = !noticeKey;
	notice.textContent = noticeKey ? t(noticeKey) : "";
}

// ---------- Small helpers ----------

function setStatus(key, values = {}, tone = "") {
	statusMessage = { key, values, tone };
	showStatus();
}

function showStatus() {
	statusText.textContent = t(statusMessage.key, statusMessage.values);
	statusText.classList.toggle("error", statusMessage.tone === "error");
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
