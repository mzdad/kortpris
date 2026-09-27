"use strict";

// ---------- Settings ----------

// The release number, read from this file's own address in index.html ("app.js?v=1.7.0"),
// so it is set in one place only. Shown at the bottom of the page.
const APP_VERSION = new URL(document.currentScript.src).searchParams.get("v") || "dev";
// Prices older than this get an "out of date" label.
const STALE_AFTER_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXAMPLE_CARD_IMAGE = "https://assets.tcgdex.net/en/base/base1/4/high.png";
// Where the phone remembers the chosen language between visits.
const LANGUAGE_STORAGE_KEY = "kortpris.language";
// Claude's word for a card's finish, and the version (price) that goes with it.
const CLAUDE_FINISH_VERSIONS = { holo: "holofoil", reverse_holo: "reverseHolofoil", normal: "normal" };
// Where the phone remembers whether kids mode is on.
const KIDS_MODE_STORAGE_KEY = "kortpris.kidsMode";
// A version's big price from this amount up (six digits) gets a smaller size, so it fits its box.
const LONG_PRICE_FROM = 100000;
// Kids mode shows a card's value as 1 to 5 Poké Balls: one more ball from each of these prices, in
// kroner (whichever currency the prices are shown in). Five balls also gets a "Wow!".
const BALL_STEPS_DKK = [20, 40, 250, 520];
const MOST_BALLS = 5;
// ...and the more balls, the better the ball: one Poké Ball, two Premier Balls, three Great Balls,
// four Ultra Balls, five Master Balls.
const BALL_KINDS = ["poke", "premier", "great", "ultra", "master"];
// Each ball's markings on its top half, drawn over the ball's colour (see ballPictureHtml).
const BALL_MARKINGS = {
	poke: "",
	premier: "",
	great: `<ellipse class="ball-marking" cx="8.5" cy="9.5" rx="3.6" ry="2" transform="rotate(-40 8.5 9.5)"/>
		<ellipse class="ball-marking" cx="23.5" cy="9.5" rx="3.6" ry="2" transform="rotate(40 23.5 9.5)"/>`,
	ultra: `<rect class="ball-marking" x="6.8" y="5.2" width="3.4" height="10" rx="1.2"/>
		<rect class="ball-marking" x="21.8" y="5.2" width="3.4" height="10" rx="1.2"/>`,
	master: `<circle class="ball-marking" cx="8.5" cy="9.5" r="3"/>
		<circle class="ball-marking" cx="23.5" cy="9.5" r="3"/>
		<path class="ball-letter" d="M12.6 12.4V6.8l3.4 3.6 3.4-3.6v5.6"/>`,
};
// In kids mode every status message is swapped for a short one...
const KID_STATUS = {
	statusIdle: "kidIdle",
	readerStarting: "kidBusy",
	readerStartingSlow: "kidBusy",
	reading: "kidBusy",
	claudeReading: "kidBusy",
	downloadingExample: "kidBusy",
	lookingUp: "kidBusy",
	comparingPictures: "kidBusy",
	comparingProgress: "kidBusy",
	foundOne: "kidFound",
	bestMatchOpened: "kidFound",
	learnedOpened: "kidFound",
	learnedChecking: "kidFound",
	learnedSuggested: "kidPickOne",
	foundMany: "kidPickOne",
	foundManyByLook: "kidPickOne",
	noMatch: "kidNotFound",
	readFailed: "kidNotFound",
	unsureName: "kidNotFound",
	needNameOrNumber: "kidNotFound",
	claudeNotACard: "kidNotFound",
	apiDown: "kidTryLater",
	apiTooMany: "kidTryLater",
	exampleFailed: "kidTryLater",
};
// ...with a picture, so it can be understood without reading...
const KID_STATUS_ICONS = {
	kidIdle: "📷", kidBusy: "🔎", kidFound: "🎉", kidPickOne: "👇", kidNotFound: "🤔", kidTryLater: "⏳",
};
// ...and these are also said out loud. (A found card is said with its name and value instead.)
const KID_SPOKEN = {
	kidBusy: "sayLooking",
	kidPickOne: "sayPickOne",
	kidNotFound: "sayNotFound",
	kidTryLater: "sayTryLater",
};

// The text key for each kind of card, the group names in "My cards" (CARD_KINDS in collection.js).
const KIND_TEXT_KEYS = { "Pokémon": "kindPokemon", "Trainer": "kindTrainer", "Energy": "kindEnergy" };

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
const currencySelect = document.getElementById("currency-select");
const appVersionText = document.getElementById("app-version");
const ratesNote = document.getElementById("rates-note");
const viewButtons = document.querySelectorAll("[data-view]");
const scanView = document.getElementById("scan-view");
const collectionView = document.getElementById("collection-view");
const collectionCount = document.getElementById("collection-count");
const collectionSummary = document.getElementById("collection-summary");
const collectionList = document.getElementById("collection-list");
const collectionSearchRow = document.getElementById("collection-search-row");
const collectionSearch = document.getElementById("collection-search");
const collectionSearchNote = document.getElementById("collection-search-note");
const collectionPage = document.getElementById("collection-page");
const savedCardView = document.getElementById("saved-card-view");
const savedCardBack = document.getElementById("saved-card-back");
const savedCardPanel = document.getElementById("saved-card");
const voiceSettings = document.getElementById("voice-settings");
const voiceSelects = document.querySelectorAll("[data-voice-language]");
const learnedSettings = document.getElementById("learned-settings");
const learnedCount = document.getElementById("learned-count");
const learnedList = document.getElementById("learned-list");
const learnedNone = document.getElementById("learned-none");
const forgetAllButton = document.getElementById("forget-all-learned");
const learnedWhere = document.getElementById("learned-where");
const notice = document.getElementById("notice");
const claudeSettings = document.getElementById("claude-settings");
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
const kidsButton = document.getElementById("kids-button");
const kidStartButton = document.getElementById("kid-start");
const liveCameraView = document.getElementById("live-camera");
const cameraVideo = document.getElementById("camera-video");
const cameraBox = document.getElementById("camera-box");
const cameraFrame = document.getElementById("camera-frame");
const cameraMessage = document.getElementById("camera-message");
const cameraCloseButton = document.getElementById("camera-close");
const cameraLightButton = document.getElementById("camera-light");
const cameraShutterButton = document.getElementById("camera-shutter");
const cameraZoomButton = document.getElementById("camera-zoom");
const cameraPhoneButton = document.getElementById("camera-phone");

// ---------- What is on screen right now ----------
// Kept as plain data so everything can be redrawn when the language changes.

let language = startLanguage();
let kidsMode = readStorage(KIDS_MODE_STORAGE_KEY) === "on";   // big pictures, few words, read aloud
let currency = startCurrency();   // the currency picked in the menu (currency.js)
let money = makeMoneyFormats(language, shownCurrency());
let statusMessage = { key: "statusIdle", values: {}, tone: "" };
let shownCards = [];              // the cards from the latest search
let shownDescription = null;      // which kind of search found them: { key, values }
let selectedCardId = null;        // the card whose prices are open
let bestMatchId = null;           // the card that looks most like the photo
let suggestedIds = [];            // learned cards the photo looks somewhat like (learned.js)
let chosenVersion = null;         // the version picked on the open card ("reverseHolofoil"), or null
let versionHint = null;           // the version Claude saw in the photo, used until one is picked
let saveFailed = false;           // the browser refused to save "My cards"
let refreshingPrices = false;     // "Update prices" is busy
let refreshMessage = null;        // what the last price update said: a text key, or null
let noticeMessage = null;         // a yellow notice under the status: { key, values }, or null
let claudeMessageKey = null;      // what the Claude settings last said: a text key, or null
let accountMode = "sign-in";      // the account form signs in, or creates an account ("create")
let accountBusy = false;          // waiting for Firebase to sign in or create an account
let accountsReady = false;        // Firebase has started
let accountMessage = null;        // { key, values, tone } shown under the account form, or null
let passwordsShown = false;       // the password boxes show their letters
let stopWatchingCards = null;     // stops listening for the signed-in account's cards
let stopWatchingLearned = null;   // stops listening for the signed-in account's learned cards
let savedPage = null;             // the saved card whose page My cards shows (see openSavedCard), or null
let listScrolledTo = 0;           // how far down My cards' list was when that page opened

// Each new photo or search gets a number. When an older one finishes late,
// its answer is thrown away so it can't overwrite the newer one.
let latestScanId = 0;
let latestSearchId = 0;
let photoUrl = null;
// The latest photo (shrunk) and where its text was, for comparing cards' looks.
// Stays null until a photo is taken, so typed searches work as they always did.
let lastPhoto = null;
// The cards shown came from a search about that photo, so tapping one answers which card it shows.
let resultsForPhoto = false;
// The app's own camera while it is open (camera.js), and its zoom and light.
let liveCamera = null;
let cameraZoom = chosenCameraZoom();
let cameraLight = chosenCameraLight();
// The size and kind of the last photo from the app's camera, shown at the bottom of the page.
let lastCameraPhoto = null;
// The number the reader put in the box, and every other number it thought possible.
let scannedNumbers = { shown: "", guesses: [] };

applyLanguage();
// A newer version is loaded first, if there is one; then cards saved before 1.32.0 are translated.
reloadIfNewerVersion().then((reloading) => {
	if (!reloading) moveOldCardsToTcgdex();
});

// Today's exchange rates arrive a moment after the page; then every price is drawn again.
loadRates().then(() => {
	money = makeMoneyFormats(language, shownCurrency());
	renderResults();
	renderCollection();
	renderFooter();
});

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

function makeMoneyFormats(lang, code) {
	const locale = NUMBER_LOCALES[lang];
	// Rupiah amounts are large and have no cents in everyday use.
	const decimals = code === "IDR" ? 0 : 2;
	return {
		locale: locale,
		code: code,   // the currency prices are shown in
		euros: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }),
		dollars: new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }),
		local: new Intl.NumberFormat(locale, {
			style: "currency",
			currency: code,
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		}),
		// Rounded prices for kids mode and PSA prices: "33 kr." rather than "32,89 kr.".
		whole: new Intl.NumberFormat(locale, {
			style: "currency",
			currency: code,
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		}),
		wholeDollars: new Intl.NumberFormat(locale, {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 0,
			maximumFractionDigits: 0,
		}),
	};
}

// The picked currency, or euros until its exchange rate is known.
function shownCurrency() {
	return canShowCurrency(currency) ? currency : "EUR";
}

// The price that stands for a card version, in the shown currency: Cardmarket's if it has one,
// otherwise TCGplayer's converted from dollars. null when there is neither (or no rate yet).
function localPrice(eur, usd) {
	if (eur > 0) return fromEuros(eur, money.code);
	if (usd > 0) return fromDollars(usd, money.code);
	return null;
}

function applyLanguage() {
	document.documentElement.lang = language;
	// Kids mode is mostly style.css hiding the grown-up parts, keyed on this class.
	document.body.classList.toggle("kids", kidsMode);
	kidsButton.setAttribute("aria-pressed", String(kidsMode));
	money = makeMoneyFormats(language, shownCurrency());
	currencySelect.value = currency;

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
	renderVoiceSettings();
	renderLearned();
	renderAccount();
	renderFooter();
	if (cameraMessage.dataset.key) showCameraMessage(cameraMessage.dataset.key);
}

function renderFooter() {
	appVersionText.textContent = t("appVersion", { version: APP_VERSION });
	// How big the last photo from the app's camera was, and which kind: it helps find out why a
	// phone's photos read badly.
	if (lastCameraPhoto) {
		appVersionText.textContent += " · " + t("cameraPhotoSize", {
			size: lastCameraPhoto.width + "×" + lastCameraPhoto.height,
			source: t(lastCameraPhoto.source === "photo" ? "cameraSourcePhoto" : "cameraSourceVideo"),
		});
		const note = lastCameraPhoto.photoNote;
		if (note) appVersionText.textContent += " · " + t(note.key, note.values);
		if (lastCameraPhoto.softness !== undefined) {
			const values = { value: lastCameraPhoto.softness.toFixed(2) };
			appVersionText.textContent += " · " + t(lastCameraPhoto.sharpened ? "cameraSharpened" : "cameraSharp", values);
		}
	}
	if (shownCurrency() !== currency) {
		ratesNote.textContent = t("ratesMissing");
	} else if (ratesDate && currency !== "EUR") {
		const day = new Date(ratesDate + "T12:00:00");
		const shownDate = day.toLocaleDateString(money.locale, { day: "numeric", month: "short", year: "numeric" });
		ratesNote.textContent = t("ratesFrom", { date: shownDate });
	} else {
		ratesNote.textContent = "";
	}
}

currencySelect.addEventListener("change", () => {
	currency = currencySelect.value;
	saveCurrency(currency);
	money = makeMoneyFormats(language, shownCurrency());
	renderResults();
	renderCollection();
	renderFooter();
});

for (const button of languageButtons) {
	button.addEventListener("click", () => {
		language = button.dataset.language;
		writeStorage(LANGUAGE_STORAGE_KEY, language);
		applyLanguage();
	});
}

// ---------- Buttons ----------

cameraButton.addEventListener("click", () => openCamera());
kidStartButton.addEventListener("click", () => openCamera());
libraryButton.addEventListener("click", () => {
	showView("scan");
	if (kidsMode) say(t("sayChoosePhoto"));
	libraryInput.click();
});

// afterSave: opened by "Save and scan the next", so the camera says the last card was saved.
function openCamera(afterSave = false) {
	showView("scan");
	// Said from the button press on purpose: iPhones only let a page start speaking from a tap,
	// and after this first time it may also speak by itself when the card is found.
	if (kidsMode) say(t("sayTakePhoto"));
	// The app's own camera zooms in and lights the card; the phone's own camera screen can't be
	// told to. Browsers without a live camera open the phone's camera straight away.
	if (liveCameraPossible()) openLiveCamera(afterSave);
	else cameraInput.click();
}

// ---------- The app's own camera ----------

async function openLiveCamera(afterSave = false) {
	if (!liveCameraView.hidden) return;
	liveCameraView.hidden = false;
	document.body.classList.add("camera-open");   // the page behind mustn't scroll
	showCameraMessage("cameraStarting");
	renderCameraButtons();
	let camera;
	try {
		camera = await startLiveCamera(cameraVideo);
	} catch (error) {
		console.error(error);
		// The button to the phone's own camera stays: a tap on it can open that camera, where
		// opening it from here (not from a tap) would be blocked.
		showCameraMessage(error.name === "NotAllowedError" ? "cameraNotAllowed" : "cameraFailed");
		return;
	}
	if (liveCameraView.hidden) {
		stopLiveCamera(camera, cameraVideo);   // closed while it was starting
		return;
	}
	liveCamera = camera;
	fitCameraBox();
	await setLiveCameraSafely();
	showCameraMessage(afterSave ? "cameraSavedHint" : "cameraHint");
	renderCameraButtons();
}

function fitCameraBox() {
	// The box around the live picture takes the picture's own shape (see .camera-box in style.css).
	if (cameraVideo.videoWidth > 0) cameraBox.style.setProperty("--video-aspect", String(cameraVideo.videoWidth / cameraVideo.videoHeight));
}
// Turning the phone, or the camera changing its picture size, changes the shape.
cameraVideo.addEventListener("resize", fitCameraBox);

function closeLiveCamera() {
	if (liveCamera) stopLiveCamera(liveCamera, cameraVideo);
	liveCamera = null;
	liveCameraView.hidden = true;
	document.body.classList.remove("camera-open");
}

async function setLiveCameraSafely() {
	// Zoom and light are extras: if the camera refuses them, it still takes photos.
	try {
		await setLiveCamera(liveCamera, cameraZoom, cameraLight);
	} catch (error) {
		console.error(error);
	}
}

function showCameraMessage(key) {
	cameraMessage.textContent = key ? t(key) : "";
	cameraMessage.dataset.key = key || "";
}

function renderCameraButtons() {
	// Only the buttons this camera can use; none while it is starting.
	const running = liveCamera !== null;
	cameraShutterButton.disabled = !running;
	cameraLightButton.hidden = !running || !liveCamera.canLight;
	cameraZoomButton.hidden = !running || !liveCamera.zoomRange;
	cameraLightButton.setAttribute("aria-pressed", String(cameraLight));
	cameraZoomButton.textContent = cameraZoom + "×";
}

cameraCloseButton.addEventListener("click", closeLiveCamera);

cameraPhoneButton.addEventListener("click", () => {
	closeLiveCamera();
	cameraInput.click();
});

cameraLightButton.addEventListener("click", async () => {
	cameraLight = !cameraLight;
	chooseCameraLight(cameraLight);
	renderCameraButtons();
	await setLiveCameraSafely();
});

cameraZoomButton.addEventListener("click", async () => {
	cameraZoom = CAMERA_ZOOMS[(CAMERA_ZOOMS.indexOf(cameraZoom) + 1) % CAMERA_ZOOMS.length];
	chooseCameraZoom(cameraZoom);
	renderCameraButtons();
	await setLiveCameraSafely();
});

cameraShutterButton.addEventListener("click", async () => {
	if (!liveCamera || cameraShutterButton.disabled) return;
	cameraShutterButton.disabled = true;   // one photo per press
	showCameraMessage("cameraHoldStill");
	const frame = cameraFrameShares();
	let photo;
	try {
		photo = await takeLivePhoto(liveCamera, cameraVideo);
	} catch (error) {
		console.error(error);
		showCameraMessage("cameraFailed");
		cameraShutterButton.disabled = false;
		return;
	}
	closeLiveCamera();
	lastCameraPhoto = photo;
	renderFooter();
	// The white frame is where the card is in a live picture. A full-size photo may show more
	// than the live picture did, so there the frame's place isn't known.
	scanPhoto(photo.file, photo.source === "video" ? frame : null);
});

function cameraFrameShares() {
	// Where the white frame is on the live picture, as shares of the picture's width and height.
	// The picture fills its box exactly (see .camera-box in style.css), so the box stands for it.
	const box = cameraBox.getBoundingClientRect();
	const edges = cameraFrame.getBoundingClientRect();
	return {
		x0: (edges.left - box.left) / box.width,
		x1: (edges.right - box.left) / box.width,
		y0: (edges.top - box.top) / box.height,
		y1: (edges.bottom - box.top) / box.height,
	};
}

// Switching to another app stops the camera anyway; close it, so it starts fresh next time.
document.addEventListener("visibilitychange", () => {
	if (document.hidden && !liveCameraView.hidden) closeLiveCamera();
});

kidsButton.addEventListener("click", () => {
	kidsMode = !kidsMode;
	writeStorage(KIDS_MODE_STORAGE_KEY, kidsMode ? "on" : "off");
	applyLanguage();
	if (kidsMode) say(t("sayKidsModeOn"));
	else stopSpeaking();
});
cameraInput.addEventListener("change", () => takeFileFrom(cameraInput));
libraryInput.addEventListener("change", () => takeFileFrom(libraryInput));

searchForm.addEventListener("submit", (event) => {
	event.preventDefault();   // stay on this page instead of reloading it
	searchForCard(true);
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

resultsGrid.addEventListener("click", async (event) => {
	const button = event.target.closest(".result");
	if (!button) return;
	const card = shownCards.find((shown) => shown.id === button.dataset.cardId);
	if (!card) return;
	// The card opens with its prices, which the database gives one card at a time (see withPrices).
	button.setAttribute("aria-busy", "true");
	await loadPrices(card);
	button.removeAttribute("aria-busy");
	if (!shownCards.includes(card)) return;   // a new search took over meanwhile
	selectedCardId = card.id;
	chosenVersion = null;
	renderResults();
	scrollToDetail();
	if (resultsForPhoto) rememberCard(card);   // the viewer's answer: this is the card in the photo
	if (kidsMode) sayCard(card);
});

// Adds the card's prices before it opens (see withPrices in cards.js). When the database doesn't
// answer, the card opens without them, and says so.
async function loadPrices(card) {
	try {
		await withPrices(card);
	} catch (error) {
		console.error(error);
		card.pricesFailed = true;
	}
	return card;
}

detail.addEventListener("click", (event) => {
	const card = shownCards.find((shown) => shown.id === selectedCardId);
	if (!card) return;
	const versionButton = event.target.closest("[data-version]");
	if (versionButton) {
		chosenVersion = versionButton.dataset.version;
		renderResults();
		if (kidsMode) sayCard(card);
		return;
	}
	if (event.target.closest("[data-action='read-aloud']")) {
		sayCard(card);
		return;
	}
	const andNext = event.target.closest("[data-action='save-and-next']");
	if (!(andNext || event.target.closest("[data-action='add-to-collection']")) || !collectionReady()) return;
	saveFailed = !addToCollection(card, versionOf(card).key);
	// Saving the card the photo was taken to be says it was right: that photo is learned too.
	if (lastPhoto && lastPhoto.card && lastPhoto.card.id === card.id) rememberCard(card);
	renderResults();
	renderCollection();
	if (kidsMode && !saveFailed) say(t("saySaved"));
	// "Save and scan the next": straight back to the camera, still from the tap (see openCamera).
	if (andNext && !saveFailed) openCamera(true);
});

// The "fetch PSA prices" tick box on the open card: remembered, and the card drawn again, which
// fetches its PSA prices straight away when it was just ticked.
detail.addEventListener("change", (event) => {
	if (!event.target.matches("[data-action='fetch-psa']")) return;
	setFetchPsaPrices(event.target.checked);
	renderResults();
});

for (const button of viewButtons) {
	button.addEventListener("click", () => showView(button.dataset.view));
}

// News about the learned cards that comes later, like the account refusing to save them.
whenLearnedChanges(renderLearned);

// The cards the app has learned: each can be forgotten, or all of them.
learnedSettings.addEventListener("click", (event) => {
	const button = event.target.closest("[data-forget]");
	if (!button) return;
	forgetLearnedCard(button.dataset.forget);
	renderLearned();
});
forgetAllButton.addEventListener("click", () => {
	forgetAllLearned();
	renderLearned();
});

// The "Reading aloud" settings: a voice for each language, and a button to hear it.
for (const select of voiceSelects) {
	select.addEventListener("change", () => chooseVoice(select.dataset.voiceLanguage, select.value));
}
voiceSettings.addEventListener("click", (event) => {
	const button = event.target.closest("[data-try-voice]");
	if (!button) return;
	// The sample is always in the voice's own language, whatever language the page is in.
	const voiceLanguage = button.dataset.tryVoice;
	speak(STRINGS[voiceLanguage].voiceSample, voiceLanguage);
});
// Phones and browsers find their voices a moment after the page opens, and may add more later.
if (canSpeak()) speechSynthesis.addEventListener("voiceschanged", renderVoiceSettings);

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

// The list narrows down with every letter typed.
collectionSearch.addEventListener("input", renderCollection);
collectionSearch.addEventListener("keydown", (event) => {
	// There is nothing to send, so Enter only puts the phone's keyboard away to show the cards.
	if (event.key === "Enter") collectionSearch.blur();
});

collectionList.addEventListener("click", (event) => {
	const button = event.target.closest("[data-action]");
	if (!button || !collectionReady()) return;
	const version = button.dataset.savedVersion || null;   // older saved cards have no version
	// The card's picture, name and price open its page; − and + change how many there are.
	if (button.dataset.action === "open") {
		openSavedCard(button.dataset.cardId, version);
		return;
	}
	changeSavedCount(button.dataset.cardId, version, button.dataset.action === "more" ? 1 : -1);
	renderCollection();
	renderResults();   // the open card's "You have 2" line may have changed
});

// A saved card's page works like the Scan screen's card page (detail, above), with its own
// version picked: savedPage.version.
savedCardPanel.addEventListener("click", (event) => {
	const page = savedPage;
	if (!page) return;
	if (event.target.closest("[data-action='retry']")) {
		fetchSavedCard(page);
		return;
	}
	const card = page.card;
	if (!card) return;
	const versionButton = event.target.closest("[data-version]");
	if (versionButton) {
		page.version = versionButton.dataset.version;
		renderSavedCardPage();
		if (kidsMode) sayCard(card, page.version);
		return;
	}
	if (event.target.closest("[data-action='read-aloud']")) {
		sayCard(card, page.version);
		return;
	}
	if (!event.target.closest("[data-action='add-to-collection']") || !collectionReady()) return;
	saveFailed = !addToCollection(card, versionOf(card, page.version).key);
	renderCollection();   // the list, and this page's "You have 3" line
	renderResults();      // the Scan screen may show the same card
	if (kidsMode && !saveFailed) say(t("saySaved"));
});
savedCardPanel.addEventListener("change", (event) => {
	if (!event.target.matches("[data-action='fetch-psa']")) return;
	setFetchPsaPrices(event.target.checked);
	renderSavedCardPage();
});

savedCardBack.addEventListener("click", backToList);
// Opening a saved card's page adds a step to the browser's history (see openSavedCard), so the
// phone's own Back - a swipe from the left edge on an iPhone - closes the page, as in an app,
// instead of leaving Kortpris.
window.addEventListener("popstate", backToList);
// The app puts the list back where it was itself; the browser mustn't scroll as well.
history.scrollRestoration = "manual";

collectionSummary.addEventListener("click", async (event) => {
	if (event.target.closest("[data-action='read-aloud']")) {
		sayCollection();
		return;
	}
	if (!event.target.closest("[data-action='refresh']") || refreshingPrices) return;
	refreshingPrices = true;
	refreshMessage = null;
	renderCollection();
	try {
		await refreshCollectionPrices();
		refreshMessage = "pricesUpdated";
	} catch (error) {
		console.error(error);
		// Asked too often today from this internet connection (see askOnce in cards.js).
		refreshMessage = error.tooManyLookups ? "apiTooMany" : "refreshFailed";
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

// frame: where the white frame was, for a photo from the app's own camera (see readCardPhoto).
async function scanPhoto(imageFile, frame = null) {
	const scanId = ++latestScanId;
	latestSearchId++;   // cancel any search still running for the previous card
	intro.hidden = true;
	showPhoto(imageFile);
	lastPhoto = null;
	scannedNumbers = { shown: "", guesses: [] };
	clearResults();
	nameInput.value = "";
	numberInput.value = "";
	searchButton.disabled = true;
	setNotice(null);
	versionHint = null;

	// With a saved API key, and signed in to an account, Claude reads the card. If that fails
	// for any reason, the built-in reader takes over, and a notice says why.
	let reading = null;
	if (claudeKey() && claudeReadingAllowed()) {
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
				nameSure: true,
				number: answer.number,
				setName: answer.setName,
				photo: await photoForLooks(imageFile),
				textArea: null,
			};
			versionHint = CLAUDE_FINISH_VERSIONS[answer.finish] || null;
		} catch (error) {
			if (scanId !== latestScanId) return;
			setNotice(await claudeProblem(error));
		}
	}
	// The cards the app has learned that the photo looks like (learned.js), once compared.
	let learnedLook = null;
	if (!reading) {
		// The built-in reader finds the card in the photo first, which takes a moment. A card the app
		// has learned then opens straight away (see openLearnedEarly), and the text - 5 to 20 seconds
		// of reading - only checks it.
		getOcrWorker();   // the text reader gets ready meanwhile (it downloads the first time)
		setStatus("readerStarting");
		showProgress(null);
		const look = await lookAtPhotoSafely(imageFile, frame);
		if (scanId !== latestScanId) {
			freeLook(look);
			return;
		}
		if (look) learnedLook = compareWithLearned(look.photo, null, look.cardBox);
		let openedEarly = null;
		if (learnedLook && learnedLook.card) openedEarly = await openLearnedEarly(learnedLook.card, look, scanId);
		if (scanId !== latestScanId) {
			freeLook(look);
			return;
		}
		const searchIdBefore = latestSearchId;
		reading = await readWithBuiltInReader(imageFile, scanId, frame, look, openedEarly !== null);
		if (scanId !== latestScanId) return;
		if (openedEarly) {
			await checkLearnedCard(openedEarly, reading, scanId, searchIdBefore);
			return;
		}
	}

	// A card that sparkles outside its picture opens on its reverse holo price (see sparkle.js).
	if (reading.sparkle && reading.sparkle.reverseHolo) versionHint = "reverseHolofoil";

	searchButton.disabled = false;
	if (reading.photo) {
		// Compared already when the card's own box was found before the reading: the place of the
		// text isn't needed then. Otherwise now, by the place of the text.
		if (!learnedLook || !reading.cardBox) {
			learnedLook = compareWithLearned(reading.photo, reading.textArea, reading.cardBox || null);
		}
		lastPhoto = photoFacts(reading.photo, reading.textArea, reading.cardBox || null, reading.setName || "", learnedLook);
	}
	nameInput.value = reading.name;
	numberInput.value = reading.number;
	scannedNumbers = { shown: reading.number, guesses: reading.numberGuesses || [] };
	// A learned card is found by its looks, so it doesn't matter how badly the text read.
	const recognised = lastPhoto !== null && lastPhoto.learnedCard !== null;
	// Nothing read, or a name the reader isn't sure of and no number: searching on that would show
	// random cards. But when the photo looks somewhat like cards the app has learned, those are shown.
	const nothingToSearch = !reading.number && (!reading.name || !reading.nameSure);
	if (!recognised && nothingToSearch && lastPhoto !== null && lastPhoto.learnedSuggestions.length > 0) {
		lastPhoto.textUsable = false;
		await searchForCard();
		return;
	}
	if (!recognised && !reading.name && !reading.number) {
		hideProgress();
		setStatus("readFailed", {}, "error");
		return;
	}
	if (!recognised && !reading.nameSure && !reading.number) {
		hideProgress();
		setStatus("unsureName", {}, "error");
		numberInput.classList.add("needs-attention");
		return;
	}
	await searchForCard();
}

// look: where the card is, found before the reading (lookAtPhoto in reader.js), or null.
// quietly: a learned card is open already (see openLearnedEarly), and the status says the text is
// being checked; the reading doesn't report how it's getting on.
async function readWithBuiltInReader(imageFile, scanId, frame, look = null, quietly = false) {
	try {
		return await readCardPhoto(imageFile, (stage, fraction) => {
			if (scanId !== latestScanId || quietly) return;
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
		}, frame, { look: look, stillWanted: () => scanId === latestScanId });
	} catch (error) {
		if (!error.stopped) console.error(error);   // stopped: another photo came, nothing went wrong
		return { name: "", number: "" };
	}
}

// Where the card is in the photo (lookAtPhoto in reader.js), or null when the photo can't be
// opened: the reader then says so the usual way.
async function lookAtPhotoSafely(imageFile, frame) {
	try {
		return await lookAtPhoto(imageFile, frame);
	} catch (error) {
		console.error(error);
		return null;
	}
}

// A look that won't be read after all (another photo came): its full-size photo takes a lot of
// memory, so it is let go of at once.
function freeLook(look) {
	if (look) look.original.close();
}

// A photo of a card the app has learned opens that card as soon as the card is found in the photo,
// before its text is read (see scanPhoto). Returns the card, or null when it can't be opened now -
// the database didn't answer, or another photo came - and the scan goes on the usual way.
async function openLearnedEarly(learnedCard, look, scanId) {
	let card;
	try {
		[card] = await findCardsById([learnedCard.cardId]);
	} catch (error) {
		console.error(error);
		return null;
	}
	if (!card) return null;   // not in the database (any more): the text may still find the card
	await loadPrices(card);
	if (scanId !== latestScanId) return null;
	// A card that sparkles outside its picture opens on its reverse holo price (see sparkle.js).
	const sparkle = sparkleOf(look.photo, look.cardBox, null);
	if (sparkle && sparkle.reverseHolo) versionHint = "reverseHolofoil";
	lastPhoto = photoFacts(look.photo, null, look.cardBox, "", { card: learnedCard, suggestions: [] });
	takeFor(card, true);
	// The card's own name and number, as when a learned card is found after the reading.
	nameInput.value = card.name;
	numberInput.value = collectorNumber(card);
	scannedNumbers = { shown: numberInput.value, guesses: [] };
	searchButton.disabled = false;
	hideProgress();
	setStatus("learnedChecking");
	showResults([card], { key: "matchLearned", values: {} }, card.id, null);
	return card;
}

// After a learned card opened early (see openLearnedEarly), the text is read all the same, as a
// check: the same picture is printed in several sets (Base Set and Base Set 2 Charizard), and only
// the name and number tell them apart. When the text names another card exactly, that one is shown
// instead, as it would have been without the early look - unless the viewer searched, or saved the
// card, meanwhile: then they have decided.
async function checkLearnedCard(card, reading, scanId, searchIdBefore) {
	// Another photo, or a search of the viewer's, has the screen now.
	const tookOver = () => scanId !== latestScanId || latestSearchId !== searchIdBefore;
	// The viewer saved the card, which says it is the right one (see rememberCard).
	const confirmed = () => lastPhoto.card !== card || !lastPhoto.recognised;
	if (tookOver()) return;
	let exact = null;
	if (!confirmed()) {
		try {
			exact = await findExactCards(reading.name, allNumberGuesses(reading.number, reading.numberGuesses));
		} catch (error) {
			console.error(error);   // only a check: the learned card stays
		}
		if (tookOver()) return;
	}
	if (confirmed() || !exact || exact.cards.some((found) => found.id === card.id)) {
		setStatus("learnedOpened");
		return;
	}
	// Searched as if the text had been read before anything opened (see findLearnedCard).
	nameInput.value = reading.name;
	numberInput.value = reading.number;
	scannedNumbers = { shown: reading.number, guesses: reading.numberGuesses || [] };
	await searchForCard();
	if (scanId === latestScanId && shownCards.length > 0 && selectedCardId !== card.id) setNotice("learnedOtherPrint");
}

// What is kept about the latest photo (see lastPhoto). learnedLook: what compareWithLearned in
// learned.js said about it.
function photoFacts(photo, textArea, cardBox, setName, learnedLook) {
	return {
		picture: photo,
		textArea: textArea,
		cardBox: cardBox,
		setName: setName,
		looksReverseHolo: versionHint === "reverseHolofoil",
		// Tells this photo apart when a card is learned from it (see learnCard in learned.js).
		key: String(Date.now()),
		// A learned card the photo looks just like, or null...
		learnedCard: learnedLook.card,
		// ...or else the learned cards it looks somewhat like, to compare it with too.
		learnedSuggestions: learnedLook.suggestions,
		// Whether the text read is worth searching on (see scanPhoto).
		textUsable: true,
		// The card the photo is taken to be, once one was opened for it or learned from it...
		card: null,
		// ...and whether that was because the photo looked like a learned card.
		recognised: false,
	};
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

// byViewer: the viewer pressed Search, rather than the app searching on what it read.
async function searchForCard(byViewer = false) {
	const searchId = ++latestSearchId;
	// A photo of a card the app has learned opens that card - unless the viewer searches for another.
	const learnedCard = !byViewer && lastPhoto ? lastPhoto.learnedCard : null;
	// Learned cards the photo looks somewhat like are compared with it too, or shown on their own
	// when the text read is no use.
	const suggestions = !byViewer && lastPhoto ? lastPhoto.learnedSuggestions : [];
	const useText = byViewer || !lastPhoto || lastPhoto.textUsable;
	// The viewer's search is their answer about the photo, to learn, when the app couldn't tell which
	// card the photo shows, or took it for a learned card (it then asks for a search if that's wrong).
	// Otherwise the photo's card is known, and the viewer is looking up the price of another card.
	const answersPhoto = byViewer && lastPhoto !== null && (lastPhoto.card === null || lastPhoto.recognised);
	resultsForPhoto = lastPhoto !== null && (!byViewer || answersPhoto);
	if (!learnedCard && suggestions.length === 0 && !canSearch(nameInput.value, numberInput.value)) {
		hideProgress();
		setStatus("needNameOrNumber", {}, "error");
		return;
	}

	clearResults();
	setNotice(null);
	numberInput.classList.remove("needs-attention");
	setStatus("lookingUp");
	showProgress(null);
	searchButton.disabled = true;
	try {
		// The reader's other number guesses only count while the number box still shows its reading:
		// once the viewer types their own number, that is the one to use.
		const guesses = numberInput.value.trim() === scannedNumbers.shown ? scannedNumbers.guesses : [];
		let found = null;
		if (learnedCard) found = await findLearnedCard(learnedCard, nameInput.value, numberInput.value, guesses);
		if (!found && useText) found = await findCards(nameInput.value, numberInput.value, lastPhoto !== null, guesses);
		if (!found) found = { cards: [], description: null, totalCount: 0, exactFound: false };
		found = await withLearnedSuggestions(found, suggestions);
		if (searchId !== latestSearchId) return;   // a newer photo or search took over
		if (found.learned) {
			// Show the recognised card's own name and number, whatever was read.
			nameInput.value = found.cards[0].name;
			numberInput.value = collectorNumber(found.cards[0]);
			scannedNumbers.shown = numberInput.value;
		}
		// Another of the guesses was the right number: show that one.
		if (found.matchedNumber && found.matchedNumber !== numberInput.value.trim()) {
			numberInput.value = found.matchedNumber;
			scannedNumbers.shown = found.matchedNumber;
		}
		showNumberHint(found);
		if (found.cards.length === 0) {
			hideProgress();
			setStatus("noMatch", {}, "error");
		} else if (found.suggestedOnly) {
			// Only learned cards the photo looks somewhat like: shown to pick from, but never opened
			// by themselves, as the text read gave nothing to back them up.
			hideProgress();
			setStatus("learnedSuggested");
			showResults(found.cards, found.description, null, null, found.suggestedIds);
		} else if (found.cards.length === 1) {
			await loadPrices(found.cards[0]);
			if (searchId !== latestSearchId) return;
			hideProgress();
			setStatus(found.learned ? "learnedOpened" : "foundOne");
			if (!found.exactFound) fixMisreadName(found.cards[0], guesses);
			showResults(found.cards, found.description, found.cards[0].id, null);
			if (answersPhoto) rememberCard(found.cards[0]);
			else if (!byViewer) takeFor(found.cards[0], Boolean(found.learned));
		} else if (!lastPhoto) {
			hideProgress();
			setStatus("foundMany", { count: found.cards.length });
			showResults(found.cards, found.description, null, null);
		} else {
			// Several cards fit the text: let the photo pick the one that looks most like it.
			setStatus("comparingPictures");
			const ranked = await rankByLook(lastPhoto.picture, lastPhoto.textArea, found.cards, lastPhoto.cardBox, (done, total) => {
				if (searchId !== latestSearchId) return;
				setStatus("comparingProgress", { done: done, total: total });
				showProgress(done / total);
			});
			if (searchId !== latestSearchId) return;
			hideProgress();
			// Only trust looks when the reader also found where the card sits in the photo.
			const cardLocated = lastPhoto.cardBox !== null || lastPhoto.textArea !== null;
			const suggested = found.suggestedIds || [];
			const pick = pickBestMatch(ranked, cardLocated, found.setSizes, lastPhoto.setName, found.numbersRead, lastPhoto.looksReverseHolo, suggested);
			const cards = firstPageWith(pick.cards, suggested);
			const best = cards[0].id;
			if (pick.clear) {
				await loadPrices(cards[0]);
				if (searchId !== latestSearchId) return;
				setStatus("bestMatchOpened");
				fixMisreadName(cards[0], guesses);
				showResults(cards, found.description, best, best, suggested);
				if (answersPhoto) rememberCard(cards[0]);
				else if (!byViewer) takeFor(cards[0], false);
			} else {
				setStatus("foundManyByLook", { count: cards.length });
				showResults(cards, found.description, null, best, suggested);
			}
		}
	} catch (error) {
		console.error(error);
		if (searchId !== latestSearchId) return;
		hideProgress();
		// Asked too often today from this internet connection (see askOnce in cards.js).
		setStatus(error.tooManyLookups ? "apiTooMany" : "apiDown", {}, "error");
	} finally {
		if (searchId === latestSearchId) searchButton.disabled = false;
	}
}

// The first page of cards to show - with the learned cards the photo looks somewhat like (ids) on
// it, even when their own pictures look less alike than a page of others.
function firstPageWith(cards, ids) {
	const page = cards.slice(0, RESULTS_PAGE_SIZE);
	const missing = cards.filter((card) => ids.includes(card.id) && !page.includes(card));
	return [...page.slice(0, RESULTS_PAGE_SIZE - missing.length), ...missing];
}

// The app opened this card for the latest photo by itself: the photo is taken to be that card.
// recognised: because the photo looked like a learned card.
function takeFor(card, recognised) {
	if (!lastPhoto) return;
	lastPhoto.card = card;
	lastPhoto.recognised = recognised;
}

// The viewer answered which card the latest photo shows (or confirmed it by saving it): remember
// how it looked there, so the next photo of it is recognised straight away (learned.js).
function rememberCard(card) {
	const photo = lastPhoto;
	if (!photo || !card) return;
	learnCard(card, photo.picture, photo.textArea, photo.cardBox, photo.key).then((learned) => {
		if (learned) {
			photo.card = card;
			photo.recognised = false;
		}
		renderLearned();
	}, (error) => {
		console.error(error);   // not learned this time; nothing else changes
	});
}

function fixMisreadName(card, guesses) {
	// A card was opened although the name and number read didn't both fit it, so one of them was
	// misread. If the card has one of the numbers the reader saw, the number was right and the
	// name was wrong (a glittery "Pikachu" read as "Pokéman"): show the card's real name and
	// number, and take back the hint to check the number. The same goes when only the set size
	// could be read ("?/110") and the card is from a set of that size.
	const numberRead = [numberInput.value, ...guesses].find((text) => sameCollectorNumber(card, text))
		|| [numberInput.value, ...guesses].find((text) => onlySetSizeFits(card, text));
	if (!numberRead) return;
	nameInput.value = card.name;
	numberInput.value = sameCollectorNumber(card, numberRead) ? numberRead.trim() : card.number + "/" + card.set.printedTotal;
	scannedNumbers.shown = numberInput.value;
	setNotice(null);
	numberInput.classList.remove("needs-attention");
}

function sameCollectorNumber(card, numberText) {
	// A promo's code ("SWSH193") has no set size to compare, but may name the set ("SVP 001").
	const read = parseCollectorNumber(numberText);
	const printed = parseCollectorNumber(card.number + "/" + card.set.printedTotal);
	if (read.set && read.set !== card.set.id) return false;
	return read.number !== "" && numberSpellings(read.number).includes(printed.number)
		&& (read.total === printed.total || isPromoCode(read));
}

function onlySetSizeFits(card, numberText) {
	// "?/110": the card's own number couldn't be read, but its set size could.
	const read = parseCollectorNumber(numberText);
	return read.number === "" && read.total !== "" && read.total === String(card.set.printedTotal);
}

function showNumberHint(found) {
	// The collector number is what tells apart the many cards with the same name.
	const name = longestWord(nameInput.value);
	const { number } = parseCollectorNumber(numberInput.value);
	if (!name || found.cards.length === 0) return;
	let hint = null;
	if (number && !found.exactFound) {
		hint = { key: "numberNotFound", values: { name: name, number: numberInput.value.trim() } };
	} else if (!number && found.totalCount > found.cards.length) {
		hint = { key: "typeNumber", values: { name: name, total: found.totalCount } };
	}
	if (hint) {
		setNotice(hint.key, hint.values);
		numberInput.classList.add("needs-attention");
	}
}

// ---------- Step 3: show the matches and the prices ----------

// openId: the card whose prices open straight away (or null to let the viewer pick).
// bestId: the card to mark "Best match" (or null).
// suggested: the ids of learned cards to mark "Seen before".
function showResults(cards, description, openId, bestId, suggested = []) {
	chosenVersion = null;
	shownCards = cards;
	shownDescription = description;
	selectedCardId = openId;
	bestMatchId = bestId;
	suggestedIds = suggested;
	renderResults();
	const opened = cards.find((card) => card.id === openId);
	if (kidsMode && opened) sayCard(opened);
}

function clearResults() {
	shownCards = [];
	shownDescription = null;
	selectedCardId = null;
	bestMatchId = null;
	suggestedIds = [];
	renderResults();
}

function renderResults() {
	// Draws the grid of matches and the open card's prices from the data above.
	const selectedCard = shownCards.find((card) => card.id === selectedCardId);
	detail.hidden = !selectedCard;
	let detailHtml = "";
	if (selectedCard) detailHtml = kidsMode ? kidCardDetailHtml(selectedCard) : cardDetailHtml(selectedCard);
	detail.innerHTML = detailHtml;

	// A single card is shown open, unless it is only a suggestion (see learnedSuggested).
	const showList = shownCards.length > 1 || (shownCards.length === 1 && !selectedCard);
	results.hidden = !showList;
	if (!showList) {
		resultsGrid.innerHTML = "";
		return;
	}
	let note = t(shownDescription.key, shownDescription.values);
	if (shownCards.length === RESULTS_PAGE_SIZE) note += t("showingFirst", { count: RESULTS_PAGE_SIZE });
	resultsNote.textContent = note;
	resultsGrid.innerHTML = shownCards.map(resultButtonHtml).join("");
}

function resultButtonHtml(card) {
	let badge = card.id === bestMatchId ? `<span class="badge">${t("bestMatch")}</span>` : "";
	if (suggestedIds.includes(card.id)) badge += `<span class="badge seen">${t("seenBefore")}</span>`;
	// Loaded the same way matcher.js loads it, so each picture downloads only once.
	return `
		<button class="result" type="button" data-card-id="${escapeHtml(card.id)}" aria-pressed="${card.id === selectedCardId}">
			<img class="card-image" src="${escapeHtml(readablePictureUrl(card.images && card.images.small))}" alt="" loading="lazy" crossorigin="anonymous" width="245" height="342">
			${badge}
			<span class="result-name">${escapeHtml(card.name)}</span>
			<span class="result-set">${escapeHtml(card.set.name)}<br><span class="mono">${escapeHtml(collectorNumber(card))}</span></span>
		</button>`;
}

function scrollToDetail() {
	const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	detail.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

// pickedKey: the version picked on the page (see versionOf). onScanScreen: false for a saved card's
// page in My cards, where no photo picked the version and there is no search to fix.
function cardDetailHtml(card, pickedKey = chosenVersion || versionHint, onScanScreen = true) {
	const meta = [escapeHtml(card.set.name), `<span class="mono">${escapeHtml(collectorNumber(card))}</span>`];
	if (card.rarity) meta.push(escapeHtml(card.rarity));

	const versions = cardVersions(card);
	const version = versionOf(card, pickedKey);
	const notYours = onScanScreen && shownCards.length === 1 ? `<p class="fineprint">${t("notYours")}</p>` : "";
	// The photo picked the reverse holo (see sparkle.js), and the viewer hasn't picked another yet.
	const fromPhoto = onScanScreen && !chosenVersion && versionHint === "reverseHolofoil";

	const owned = savedCount(card.id, version.key);
	let ownedNote = "";
	if (owned > 0) {
		ownedNote = `<p class="own-note">${t(versions.length > 1 ? "inCollectionVersion" : "inCollection", { count: owned })}</p>`;
	}
	const saveProblem = saveFailed ? `<p class="status error">${t("storageBlocked")}</p>` : "";
	let addText = owned > 0 ? "addAnother" : "addToCollection";
	if (!collectionReady()) addText = "loadingAccountCards";
	// For a stack of cards: save this one and go straight back to the camera for the next.
	const saveAndNext = onScanScreen
		? `<button type="button" class="button primary" data-action="save-and-next" ${collectionReady() ? "" : "disabled"}>
				<span aria-hidden="true">📷</span> ${t("saveAndNext")}
			</button>`
		: "";
	const own = `
		<div class="own">
			<div class="own-buttons">
				<button type="button" class="button secondary" data-action="add-to-collection" ${collectionReady() ? "" : "disabled"}>
					${t(addText)}
				</button>
				${saveAndNext}
			</div>
			${ownedNote}
			${saveProblem}
		</div>`;

	return `
		<div class="detail-head">
			<img class="card-image" src="${escapeHtml(readablePictureUrl(card.images && card.images.small))}" alt="${escapeHtml(card.name)}" crossorigin="anonymous" width="245" height="342">
			<div>
				<div class="name-row">
					<h2 class="detail-name">${escapeHtml(card.name)}</h2>
					${readAloudButtonHtml()}
				</div>
				<p class="detail-meta">${meta.join(" · ")}</p>
			</div>
		</div>
		${versionsHtml(versions, version.key, card.pricesFailed, fromPhoto)}
		${versions.length === 0 ? `<p>${storeLinkHtml(ebaySoldUrl(card, version), t("soldOnEbay"))}</p>` : ""}
		${own}
		${cardmarketTableHtml(card)}
		${tcgplayerTableHtml(card.tcgplayer)}
		${gradedLinksHtml(card, version)}
		<p class="fineprint">${t("ungraded")}</p>
		${notYours}`;
}

function collectorNumber(card) {
	return card.set.printedTotal ? card.number + "/" + card.set.printedTotal : card.number;
}

// ---------- Versions ----------
// One card can be printed in several versions - normal, holo, reverse holo, 1st edition - and
// their prices can be worlds apart: a reverse holo can be worth a hundred times the normal one.

// Cardmarket keeps two prices per card: its regular print and its reverse holo. Best first.
const CARDMARKET_REGULAR = ["avg30", "trendPrice", "averageSellPrice"];
const CARDMARKET_REVERSE = ["reverseHoloAvg30", "reverseHoloTrend", "reverseHoloSell"];
// Cardmarket's regular price belongs to the first of these versions the card has.
const REGULAR_VERSIONS = ["holofoil", "normal", "unlimitedHolofoil", "unlimited"];

// Returns [{ key, eur, usd }]: key is the version's text key in strings.js, eur its Cardmarket
// price in euros, usd TCGplayer's market price in dollars. Either price may be null.
function cardVersions(card) {
	const tcgplayer = (card.tcgplayer && card.tcgplayer.prices) || {};
	const cardmarket = (card.cardmarket && card.cardmarket.prices) || {};
	const versions = [];
	for (const [apiName, textKey] of TCGPLAYER_VARIANTS) {
		const price = tcgplayer[apiName];
		if (price && (price.market > 0 || price.low > 0)) {
			versions.push({ key: textKey, eur: null, usd: price.market > 0 ? price.market : null });
		}
	}
	const reverse = firstPrice(cardmarket, CARDMARKET_REVERSE);
	if (reverse !== null && cardmarketReverseCounts(card)) {
		findOrAddVersion(versions, ["reverseHolofoil"], "reverseHolofoil").eur = reverse;
	}
	const regular = firstPrice(cardmarket, CARDMARKET_REGULAR);
	if (regular !== null) findOrAddVersion(versions, REGULAR_VERSIONS, "normal").eur = regular;
	return versions;
}

// Cardmarket has "reverse holo" prices for some cards never printed that way (Base Set Charizard).
// The database's list of a card's prints (card.variants) says whether there is one; without that
// list, Cardmarket is believed. Its reverse holo prices are shown only when this says true: in the
// version boxes and in the Cardmarket table.
function cardmarketReverseCounts(card) {
	const knowsPrints = card.variants && Object.keys(card.variants).length > 0;
	return !knowsPrints || Boolean(card.variants.reverse);
}

function firstPrice(prices, keys) {
	for (const key of keys) {
		if (prices[key] > 0) return prices[key];
	}
	return null;
}

function findOrAddVersion(versions, keys, newKey) {
	let version = versions.find((candidate) => keys.includes(candidate.key));
	if (!version) {
		version = { key: newKey, eur: null, usd: null };
		versions.unshift(version);
	}
	return version;
}

// The version the viewer picked, or else the card's main one: the first with a Cardmarket price,
// and not the reverse holo if there is another, because most copies of a card are the regular print.
function versionOf(card, pickedKey = chosenVersion || versionHint) {
	const versions = cardVersions(card);
	return versions.find((version) => version.key === pickedKey)
		|| versions.find((version) => version.eur !== null && version.key !== "reverseHolofoil")
		|| versions.find((version) => version.eur !== null)
		|| versions[0]
		|| { key: "normal", eur: null, usd: null };
}

// pricesFailed: the database didn't answer when the card's prices were asked for.
// fromPhoto: the photo picked the reverse holo, not the viewer (see cardDetailHtml).
function versionsHtml(versions, chosenKey, pricesFailed = false, fromPhoto = false) {
	if (versions.length === 0) return `<p class="note">${t(pricesFailed ? "pricesFailed" : "noPrices")}</p>`;
	const choosing = versions.length > 1;
	const tiles = versions.map((version) => {
		// The big price in whole kroner (the exact amounts are in the small print below it).
		const local = localPrice(version.eur, version.usd);
		let main = t("noPrice");
		let amount = null;
		if (local !== null) {
			main = bigPriceHtml(money.whole, local);
			amount = local;
		} else if (version.usd !== null) {
			main = bigPriceHtml(money.wholeDollars, version.usd);
			amount = version.usd;
		}
		const long = amount !== null && Math.round(amount) >= LONG_PRICE_FROM ? " long" : "";
		const sources = [];
		if (version.eur !== null) sources.push(money.euros.format(version.eur) + " · Cardmarket");
		if (version.usd !== null) sources.push(money.dollars.format(version.usd) + " · TCGplayer");
		const inside = `
			<span class="version-name">${t(version.key)}</span>
			<span class="version-price-box"><span class="version-price${long}">${main}</span></span>
			<span class="version-sub">${sources.join("<br>")}</span>`;
		// With one version there is nothing to pick, so it is shown as a plain box.
		if (!choosing) return `<div class="version">${inside}</div>`;
		return `<button type="button" class="version" data-version="${version.key}" aria-pressed="${version.key === chosenKey}">${inside}</button>`;
	});
	const question = choosing ? `<p class="versions-question">${t("whichVersion")}</p>` : "";
	// Say so when the photo picked the reverse holo (see sparkle.js), so a wrong guess is noticed.
	const byPhoto = choosing && fromPhoto && chosenKey === "reverseHolofoil";
	const hint = choosing ? `<p class="hint">${t(byPhoto ? "versionFromPhoto" : "versionHint")}</p>` : "";
	return `<div class="versions-block">${question}<div class="versions">${tiles.join("")}</div>${hint}</div>`;
}

function bigPriceHtml(format, amount) {
	// A big price with its currency ("kr.", "DKK", "€") drawn smaller, so the number stands out.
	return format.formatToParts(amount)
		.map((part) => part.type === "currency"
			? `<span class="price-unit">${escapeHtml(part.value)}</span>`
			: escapeHtml(part.value))
		.join("");
}

// Cardmarket is Europe's biggest card shop, priced in euros.

function bestCardmarketPrice(cardmarket) {
	const prices = (cardmarket && cardmarket.prices) || {};
	for (const key of ["avg30", "trendPrice", "averageSellPrice"]) {
		if (prices[key] > 0) return { value: prices[key], key: key };
	}
	return null;
}

function cardmarketTableHtml(card) {
	const cardmarket = card.cardmarket;
	if (!bestCardmarketPrice(cardmarket)) return "";
	// Euros is the shop's own currency; a second column converts when another one is picked.
	const showsEuros = money.code === "EUR";
	// The reverse holo rows only for a card printed that way (see cardmarketReverseCounts).
	const showsReverse = cardmarketReverseCounts(card);
	const rows = CARDMARKET_ROWS
		.filter((key) => cardmarket.prices[key] > 0)
		.filter((key) => showsReverse || !CARDMARKET_REVERSE.includes(key))
		.map((key) => {
			const value = cardmarket.prices[key];
			const converted = showsEuros ? "" : `<td>${money.local.format(fromEuros(value, money.code))}</td>`;
			return `<tr><td>${t(key)}</td><td>${money.euros.format(value)}</td>${converted}</tr>`;
		});
	return `
		<div class="source">
			<h3>Cardmarket</h3>
			${updatedHtml(cardmarket.updatedAt)}
			<table class="price-table">
				<thead><tr><th>${t("cardmarketPrice")}</th><th>${t("euro")}</th>${showsEuros ? "" : `<th>${money.code}</th>`}</tr></thead>
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

// Graded cards: their prices come through the Kortpris relay (graded.js), and these links
// search the real sales as well.
function gradedLinksHtml(card, version) {
	const priceCharting = "https://www.pricecharting.com/search-products?type=prices&q="
		+ encodeURIComponent(card.name + " " + card.set.name + " " + card.number);
	return `
		<div class="source">
			<h3>${t("gradedTitle")}</h3>
			<p class="hint">${t("gradedExplain")}</p>
			${gradedPricesHtml(card)}
			<div class="graded-links">
				${storeLinkHtml(ebaySoldUrl(card, version, "PSA 10"), t("gradedEbay", { grade: "PSA 10" }))}
				${storeLinkHtml(ebaySoldUrl(card, version, "PSA 9"), t("gradedEbay", { grade: "PSA 9" }))}
				${storeLinkHtml(priceCharting, t("gradedPriceCharting"))}
			</div>
		</div>`;
}

function gradedPricesHtml(card) {
	// A table of what the card sold for in each PSA grade: the middle price of the sales, in the
	// chosen currency and in dollars as sold, and how many sales it is based on.
	if (!gradedPricesAvailable()) return "";
	// The tick box that switches fetching on and off (see fetchPsaPrices in graded.js), and how
	// many cards can still be looked up today. Either arriving draws the open card again.
	const allowance = psaAllowanceNow(renderCardPages);
	let left = "";
	if (allowance) {
		const values = { count: allowance.cardsLeft, time: clockTime(psaRefillTime()) };
		left = `<p class="hint">${t(allowance.cardsLeft === 1 ? "gradedLeftOne" : "gradedLeft", values)}</p>`;
	}
	const toggle = `
		<label class="check-row">
			<input type="checkbox" data-action="fetch-psa" ${fetchPsaPrices ? "checked" : ""}>
			${t("gradedFetchToggle")}
		</label>
		${left}`;
	const known = gradedPricesOf(card, renderCardPages);
	if (known.state === "off") return toggle + `<p class="note">${t("gradedOff")}</p>`;
	if (known.state === "usedUp") return toggle + `<p class="note">${t("gradedUsedUp", { time: clockTime(psaRefillTime()) })}</p>`;
	if (known.state === "loading") return toggle + `<p class="note">${t("gradedLoading")}</p>`;
	if (known.state === "failed") return toggle + `<p class="note">${t("gradedFailed")}</p>`;
	if (known.grades.length === 0) return toggle + `<p class="note">${t("gradedNone")}</p>`;
	const rows = known.grades.map((entry) => {
		const dollars = entry.median || entry.average;
		const local = localPrice(null, dollars);
		// Whole amounts: a price guessed from a few sales has no meaningful øre or cents.
		const shown = local !== null ? money.whole.format(local) : "–";
		const shownDollars = dollars > 0 ? money.wholeDollars.format(dollars) : "–";
		const sales = Number.isFinite(entry.count) ? entry.count : "–";
		return `<tr><td>PSA ${escapeHtml(entry.grade)}</td><td>${shown}</td><td>${shownDollars}</td><td>${sales}</td></tr>`;
	});
	// The sales come per card, not per version: a PSA 10 reverse holo and a PSA 10 normal print
	// count as the same card, though the reverse holo may be worth far more.
	const mixed = cardVersions(card).length > 1 ? " " + t("gradedAllVersions") : "";
	return toggle + `
		<table class="price-table">
			<thead><tr><th>${t("gradedGrade")}</th><th>${t("gradedMiddle")}</th><th>${t("gradedDollars")}</th><th>${t("gradedSales")}</th></tr></thead>
			<tbody>${rows.join("")}</tbody>
		</table>
		<p class="hint">${t("gradedFrom")}${mixed}</p>`;
}

function clockTime(date) {
	// "02.00" in Danish, "02:00" in English: the time of day on this phone's clock.
	return new Intl.DateTimeFormat(money.locale, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function ebaySoldUrl(card, version, grade = "") {
	// eBay's finished sales of this card: what people really paid. For a reprint, the number is
	// left out - the database has only half of it ("69" of "69/132"), which titles never show
	// alone - and so is the end of the set's name, which sellers skip: "30th Celebration".
	const words = isAnniversaryReprint(card)
		? ["Pokemon", card.name, card.set.name.split(":")[0]]
		: ["Pokemon", card.name, collectorNumber(card), card.set.name];
	if (version.key === "reverseHolofoil") words.push("reverse holo");
	if (version.key.startsWith("firstEdition")) words.push("1st edition");
	if (grade) words.push(grade);
	return "https://www.ebay.com/sch/i.html?LH_Sold=1&LH_Complete=1&_nkw=" + encodeURIComponent(words.join(" "));
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

// ---------- Kids mode and reading aloud ----------
// For children who can't read well yet: the card's picture and name, a row of Poké Balls for how
// valuable it is, one rounded price and big buttons - and the phone says it out loud.

// pickedKey: the version picked on the page (see versionOf). onScanScreen: false for a saved card's
// page in My cards, which has no "save and the next one".
function kidCardDetailHtml(card, pickedKey = chosenVersion || versionHint, onScanScreen = true) {
	const versions = cardVersions(card);
	const version = versionOf(card, pickedKey);
	const owned = savedCount(card.id, version.key);
	const ownedNote = owned > 0 ? `<p class="own-note">${t("kidHave", { count: owned })}</p>` : "";
	const saveProblem = saveFailed ? `<p class="status error">${t("storageBlocked")}</p>` : "";
	const saveAndNext = onScanScreen
		? `<button type="button" class="button secondary kid-save" data-action="save-and-next" ${collectionReady() ? "" : "disabled"}>
				<span aria-hidden="true">⭐📷</span> ${t("kidSaveAndNext")}
			</button>`
		: "";
	return `
		<div class="kid-card">
			<img class="card-image kid-card-image" src="${escapeHtml(readablePictureUrl(card.images && card.images.small))}" alt="${escapeHtml(card.name)}" crossorigin="anonymous" width="245" height="342">
			<div class="name-row">
				<h2 class="detail-name">${escapeHtml(card.name)}</h2>
				${readAloudButtonHtml()}
			</div>
			${kidWorthHtml(version)}
			${versions.length > 1 ? kidVersionsHtml(versions, version.key) : ""}
			<button type="button" class="button primary kid-save" data-action="add-to-collection" ${collectionReady() ? "" : "disabled"}>
				<span aria-hidden="true">⭐</span> ${t(owned > 0 ? "kidSaveAnother" : "kidSave")}
			</button>
			${saveAndNext}
			${ownedNote}
			${saveProblem}
		</div>`;
}

function kidWorthHtml(version) {
	const local = localPrice(version.eur, version.usd);
	if (local === null) return `<p class="kid-price">${t("noPrice")}</p>`;
	return `
		<div class="kid-worth">
			${ballsHtml(ballCount(version.eur, version.usd))}
			<p class="kid-price">${kidPriceText(local)}</p>
		</div>`;
}

function kidVersionsHtml(versions, chosenKey) {
	// The versions as big buttons, each with a little picture of where that card glitters.
	const buttons = versions.map((version) => {
		const local = localPrice(version.eur, version.usd);
		return `
			<button type="button" class="kid-version" data-version="${version.key}" aria-pressed="${version.key === chosenKey}">
				${versionPictureHtml(version.key)}
				<span class="kid-version-name">${t(version.key)}</span>
				<span class="kid-version-price">${local === null ? t("noPrice") : kidPriceText(local)}</span>
			</button>`;
	});
	return `<div class="kid-versions">${buttons.join("")}</div>`;
}

function versionPictureHtml(key) {
	// A little card showing where this version glitters: on the picture (holo), everywhere but
	// the picture (reverse holo), or nowhere. 1st edition cards also get their round stamp.
	const shinyPicture = ["holofoil", "firstEditionHolofoil", "unlimitedHolofoil"].includes(key);
	const shinyCard = key === "reverseHolofoil";
	let sparkles = "";
	if (shinyPicture) sparkles = sparkleHtml(10, 10) + sparkleHtml(20, 16);
	if (shinyCard) sparkles = sparkleHtml(7, 25) + sparkleHtml(23, 27) + sparkleHtml(21, 36);
	const stamp = key.startsWith("firstEdition") ? `<circle class="stamp" cx="8" cy="24" r="2.6"/>` : "";
	return `
		<svg class="version-picture" viewBox="0 0 30 42" aria-hidden="true">
			<rect class="card-edge" x="0" y="0" width="30" height="42" rx="3"/>
			<rect class="${shinyCard ? "shine" : "card-body"}" x="2.5" y="2.5" width="25" height="37" rx="1.5"/>
			<rect class="${shinyPicture ? "shine" : "card-art"}" x="5" y="6" width="20" height="14" rx="1"/>
			<rect class="card-line" x="5" y="29" width="16" height="2" rx="1"/>
			<rect class="card-line" x="5" y="33" width="11" height="2" rx="1"/>
			${stamp}
			${sparkles}
		</svg>`;
}

function sparkleHtml(x, y) {
	// A small four-pointed star.
	return `<path class="sparkle" d="M${x} ${y - 2.4}L${x + 0.7} ${y - 0.7}L${x + 2.4} ${y}L${x + 0.7} ${y + 0.7}L${x} ${y + 2.4}L${x - 0.7} ${y + 0.7}L${x - 2.4} ${y}L${x - 0.7} ${y - 0.7}Z"/>`;
}

function ballsHtml(count) {
	// count balls of the kind for that count, then empty places up to 5, so a child sees how far up it is.
	const kind = BALL_KINDS[count - 1];
	const balls = [];
	for (let place = 1; place <= MOST_BALLS; place++) {
		balls.push(place <= count ? ballPictureHtml(kind) : `<span class="ball empty"></span>`);
	}
	const label = t("balls", { count: count, ball: t("ball_" + kind) });
	// A span, not a div: in My cards the balls are inside a button (see savedCardHtml).
	return `<span class="balls" role="img" aria-label="${label}">${balls.join("")}</span>`;
}

function ballPictureHtml(kind) {
	// A ball of this kind (BALL_KINDS): the top half in its colour with its markings, the bottom
	// half white, and a black band with the round button in the middle. Colours are in style.css.
	return `
		<svg class="ball ${kind}" viewBox="0 0 32 32" aria-hidden="true">
			<path class="ball-top" d="M1 16a15 15 0 0 1 30 0z"/>
			${BALL_MARKINGS[kind]}
			<path class="ball-bottom" d="M1 16a15 15 0 0 0 30 0z"/>
			<circle class="ball-outline" cx="16" cy="16" r="15"/>
			<path class="ball-band" d="M1 16h30"/>
			<circle class="ball-button" cx="16" cy="16" r="4.4"/>
		</svg>`;
}

function ballCount(eur, usd) {
	// 1 to 5 balls (see BALL_STEPS_DKK), or 0 when the price isn't known.
	let kroner = null;
	if (eur > 0) kroner = fromEuros(eur, "DKK");
	else if (usd > 0) kroner = fromDollars(usd, "DKK");
	if (kroner === null) return 0;
	return 1 + BALL_STEPS_DKK.filter((step) => kroner >= step).length;
}

function friendlyAmount(value) {
	// A price rounded the way people say it - 33, 230, 1500 - or null for less than 1.
	if (value < 1) return null;
	if (value < 100) return Math.round(value);
	const step = 10 ** (Math.floor(Math.log10(value)) - 1);   // keeps the first two digits
	return Math.round(value / step) * step;
}

function kidPriceText(local) {
	const rounded = friendlyAmount(local);
	if (rounded === null) return t("kidPriceUnder", { price: money.whole.format(1) });
	return t("kidPriceAbout", { price: money.whole.format(rounded) });
}

function readAloudButtonHtml() {
	if (!canSpeak()) return "";
	return `<button type="button" class="read-aloud" data-action="read-aloud" aria-label="${t("readAloud")}" title="${t("readAloud")}">🔊</button>`;
}

function say(text) {
	speak(text, language);
}

function renderLearned() {
	const cards = learnedCards();
	learnedCount.textContent = String(cards.length);
	learnedNone.hidden = cards.length > 0;
	forgetAllButton.hidden = cards.length === 0;
	learnedList.innerHTML = cards.map(learnedCardHtml).join("");
	// Where they are kept, and why the account couldn't keep them, if it couldn't.
	const place = learnedPlace();
	let where = place.account ? t("learnedInAccount", { name: place.account }) : t("learnedOnPhone");
	if (place.account && place.problem) {
		// Refused by Firebase: its rules (firestore.rules) don't know about learned cards yet.
		const problem = place.problem.key === "permissionDenied" ? t("learnedRulesMissing") : t(place.problem.key, place.problem.values);
		where = t("learnedAccountFailed", { name: place.account }) + " " + problem;
	}
	learnedWhere.textContent = where;
}

function learnedCardHtml(card) {
	return `
		<li class="saved-card">
			<img class="card-image" src="${escapeHtml(readablePictureUrl(card.image))}" alt="" loading="lazy" crossorigin="anonymous" width="245" height="342">
			<div class="saved-info">
				<span class="saved-name">${escapeHtml(card.name)}</span>
				<span class="saved-meta">${escapeHtml(card.setName)} · <span class="mono">${escapeHtml(card.number)}</span></span>
			</div>
			<button type="button" class="button secondary" data-forget="${escapeHtml(card.cardId)}">${t("learnedForget")}</button>
		</li>`;
}

function renderVoiceSettings() {
	// Each language's list: "Automatic" (the most natural voice, named), then every voice this
	// phone has for that language, most natural first (see voicesFor in speech.js).
	for (const select of voiceSelects) {
		const voiceLanguage = select.dataset.voiceLanguage;
		const voices = voicesFor(voiceLanguage);
		const chosen = chosenVoiceName(voiceLanguage);
		const automatic = voices.length > 0 ? t("voiceAutomatic", { name: shortVoiceName(voices[0]) }) : t("voiceNone");
		const options = [`<option value="">${escapeHtml(automatic)}</option>`];
		for (const voice of voices) {
			const selected = voice.name === chosen ? "selected" : "";
			options.push(`<option value="${escapeHtml(voice.name)}" ${selected}>${escapeHtml(shortVoiceName(voice))}</option>`);
		}
		select.innerHTML = options.join("");
		select.disabled = voices.length === 0;
	}
}

function shortVoiceName(voice) {
	// "Microsoft Helle - Danish (Denmark)" -> "Microsoft Helle": the language is known already.
	return voice.name.replace(/\s+-\s+.*$/, "");
}

function stopSpeaking() {
	if (canSpeak()) speechSynthesis.cancel();
}

// pickedKey: the version picked on the card's page (see versionOf).
function sayCard(card, pickedKey = chosenVersion || versionHint) {
	if (card) say(cardSentence(card, pickedKey));
}

function cardSentence(card, pickedKey) {
	// "Pikachu, Reverse holo. It's worth about 1500 kroner." The version is only named when the
	// card comes in more than one.
	const version = versionOf(card, pickedKey);
	const local = localPrice(version.eur, version.usd);
	if (local === null) return t("sayNoPrice", { name: card.name });
	const values = { name: card.name, version: t(version.key), price: spokenMoney(local) };
	const sentence = cardVersions(card).length > 1 ? t("sayWorthVersion", values) : t("sayWorth", values);
	return ballCount(version.eur, version.usd) === MOST_BALLS ? t("sayWow", { sentence: sentence }) : sentence;
}

function spokenMoney(amount) {
	const rounded = friendlyAmount(amount);
	if (rounded === null) return t("spokenUnder", { amount: moneyWords(1) });
	return t("spokenAbout", { amount: moneyWords(rounded) });
}

function moneyWords(amount) {
	// Plain digits ("1500 kroner") are read out better than money formatting ("1.500,00 kr.").
	return amount + " " + t((amount === 1 ? "unitOne" : "unitMany") + money.code);
}

function sayCollection() {
	const totals = collectionTotals();
	if (totals.cards === 0) say(t("sayCollectionEmpty"));
	else say(t("sayCollection", { price: spokenMoney(totals.value) }));
}

// ---------- My cards ----------

function showView(view) {
	if (view !== "collection") closeSavedCard();
	scanView.hidden = view !== "scan";
	collectionView.hidden = view !== "collection";
	for (const button of viewButtons) button.setAttribute("aria-pressed", String(button.dataset.view === view));
	if (view === "collection") {
		renderCollection();
		// From a saved card's page, "My cards" goes back to the list, as in an app.
		backToList();
		// Cards saved before their kind was kept are put in the right group once the database says.
		fillMissingKinds().then((changed) => { if (changed) renderCollection(); }, (error) => console.error(error));
	}
}

function renderCollection() {
	renderSavedCardPage();   // My cards may be showing a saved card's page instead of the list
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
	// Kids mode hides the search box, so a search typed earlier mustn't hide cards there.
	const query = kidsMode ? "" : collectionSearch.value;
	const shown = sorted.filter((entry) => matchesSearch(entry, query));
	collectionSearchRow.hidden = collection.length === 0;
	collectionSearchNote.textContent = searchNote(query, shown);
	// A group for each kind of card, with its cards most valuable first; empty groups are left out.
	collectionList.innerHTML = CARD_KINDS.map((kind) => {
		const entries = shown.filter((entry) => cardKind(entry) === kind);
		if (entries.length === 0) return "";
		const count = entries.reduce((total, entry) => total + entry.count, 0);
		return `
			<section class="collection-group">
				<h3 class="group-title">${t(KIND_TEXT_KEYS[kind])} <span class="count">${count}</span></h3>
				<ul class="collection-list">${entries.map(savedCardHtml).join("")}</ul>
			</section>`;
	}).join("");
}

function matchesSearch(entry, query) {
	// Every word typed must be somewhere in the card's name, set, number or version:
	// "pika" finds every Pikachu, "jungle holo" the holo cards from Jungle, "58" card 58/102.
	const words = searchableText(query).split(/\s+/).filter(Boolean);
	const versionName = entry.version ? t(entry.version) : "";
	const kindName = t(KIND_TEXT_KEYS[cardKind(entry)]);
	const cardText = searchableText([entry.name, entry.setName, entry.number, versionName, kindName].join(" "));
	return words.every((word) => cardText.includes(word));
}

function searchableText(text) {
	// Capitals and accents don't matter: "pokemon" finds "Pokémon".
	return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function searchNote(query, shown) {
	// Under the search box: how many cards were found, and what they are worth together.
	if (query.trim() === "") return "";
	if (shown.length === 0) return t("searchNothing", { query: query.trim() });
	const found = collectionTotals(shown);
	const countText = found.cards === 1 ? t("searchFoundOne") : t("searchFound", { count: found.cards });
	return found.value > 0 ? countText + " · " + t("searchWorth", { price: money.local.format(found.value) }) : countText;
}

function savedValue(entry) {
	const each = localPrice(entry.priceEur, entry.priceUsd);
	return each === null ? -1 : entry.count * each;
}

function collectionSummaryHtml(totals) {
	if (totals.cards === 0) return `<p class="note">${t("collectionEmpty")}</p>`;
	const countText = totals.cards === 1 ? t("cardCountOne") : t("cardCount", { count: totals.cards });
	const unpriced = totals.unpriced > 0 ? `<p class="fineprint">${t("notInTotal", { count: totals.unpriced })}</p>` : "";
	const message = refreshMessage
		? `<span class="${refreshMessage === "pricesUpdated" ? "note" : "status error"}">${t(refreshMessage)}</span>`
		: "";
	return `
		<span class="stat-label">${t("totalValue")}</span>
		<span class="total-row">
			<span class="total-value">${money.local.format(totals.value)}</span>
			${readAloudButtonHtml()}
		</span>
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
	const local = localPrice(entry.priceEur, entry.priceUsd);
	let each = t("noPrice");
	if (local !== null) each = money.local.format(local) + (entry.priceEur > 0 ? "" : " (TCGplayer)");
	else if (entry.priceUsd > 0) each = money.dollars.format(entry.priceUsd) + " (TCGplayer)";
	const lineTotal = local !== null && entry.count > 1
		? " · " + t("allOfThem", { price: money.local.format(savedValue(entry)) })
		: "";
	const id = escapeHtml(entry.id);
	const version = entry.version ? escapeHtml(entry.version) : "";
	const versionName = entry.version ? " · " + t(entry.version) : "";
	const balls = ballCount(entry.priceEur, entry.priceUsd);
	const kidBalls = kidsMode && balls > 0 ? ballsHtml(balls) : "";
	// The picture, name and price are one button, which opens the card's page (see openSavedCard).
	return `
		<li class="saved-card opens">
			<button type="button" class="saved-open" data-action="open" data-card-id="${id}" data-saved-version="${version}">
				<img class="card-image" src="${escapeHtml(readablePictureUrl(entry.image))}" alt="" loading="lazy" crossorigin="anonymous" width="245" height="342">
				<span class="saved-info">
					<span class="saved-name">${escapeHtml(entry.name)}</span>
					${kidBalls}
					<span class="saved-meta">${escapeHtml(entry.setName)} · <span class="mono">${escapeHtml(entry.number)}</span>${versionName}</span>
					<span class="saved-price">${t("each", { price: each })}${lineTotal}</span>
				</span>
			</button>
			<div class="stepper">
				<button type="button" data-action="fewer" data-card-id="${id}" data-saved-version="${version}" aria-label="${t("oneFewer")}">−</button>
				<span class="stepper-count">${entry.count}</span>
				<button type="button" data-action="more" data-card-id="${id}" data-saved-version="${version}" aria-label="${t("oneMore")}">+</button>
			</div>
		</li>`;
}

// ---------- A saved card's page ----------
// Tapping a card in My cards opens its page there: the page the Scan screen shows for a card it
// found, with the saved version picked. Whatever the Scan screen shows stays as it was.

// version: the saved card's version, or null for a card saved before versions were kept.
async function openSavedCard(cardId, version) {
	const entry = findSaved(cardId, version);
	if (!entry) return;
	listScrolledTo = window.scrollY;
	savedPage = { entry: entry, card: null, version: version, problem: null };
	collectionPage.hidden = true;
	savedCardView.hidden = false;
	// A step in the browser's history, for the phone's own Back to take away again (see popstate).
	history.pushState({ savedCard: true }, "");
	window.scrollTo(0, 0);
	savedCardBack.focus({ preventScroll: true });
	await fetchSavedCard(savedPage);
}

// The page shows the saved picture and name at once, and the rest when the database has sent the
// card and its prices. page.problem says why they didn't come: a text key, or null.
async function fetchSavedCard(page) {
	page.problem = null;
	renderSavedCardPage();
	try {
		const [card] = await findCardsById([page.entry.id]);
		if (card) {
			await withPrices(card);
			page.card = card;
		} else {
			// A card saved before 1.32.0 that TCGdex doesn't have (see moveSavedCardsToTcgdex).
			page.problem = "savedCardMissing";
		}
	} catch (error) {
		console.error(error);
		// Asked too often today from this internet connection (see askOnce in cards.js).
		page.problem = error.tooManyLookups ? "apiTooMany" : "savedCardFailed";
	}
	if (page !== savedPage) return;   // closed meanwhile, or another card's page opened
	if (page.card && page.version === null) page.version = nameSavedVersion(page.card);
	renderCollection();   // the page - and the list behind it, which may name that version now
	if (page.card && kidsMode) sayCard(page.card, page.version);
}

function renderSavedCardPage() {
	const page = savedPage;
	if (!page) return;
	if (!page.card) savedCardPanel.innerHTML = savedCardWaitingHtml(page.entry, page.problem);
	else if (kidsMode) savedCardPanel.innerHTML = kidCardDetailHtml(page.card, page.version, false);
	else savedCardPanel.innerHTML = cardDetailHtml(page.card, page.version, false);
}

// Until the card arrives, or when it can't: the saved picture, name and number, and why.
function savedCardWaitingHtml(entry, problem) {
	const picture = escapeHtml(readablePictureUrl(entry.image));
	const name = escapeHtml(entry.name);
	let message = `<p class="note">${t("savedCardLoading")}</p>`;
	if (problem) message = `<p class="status error">${t(problem)}</p>`;
	// Trying again helps when the database didn't answer, not when it hasn't got the card.
	if (problem && problem !== "savedCardMissing") {
		message += `<button type="button" class="button secondary" data-action="retry">${t("tryAgain")}</button>`;
	}
	if (kidsMode) {
		return `
			<div class="kid-card">
				<img class="card-image kid-card-image" src="${picture}" alt="${name}" crossorigin="anonymous" width="245" height="342">
				<h2 class="detail-name">${name}</h2>
				${message}
			</div>`;
	}
	return `
		<div class="detail-head">
			<img class="card-image" src="${picture}" alt="${name}" crossorigin="anonymous" width="245" height="342">
			<div>
				<h2 class="detail-name">${name}</h2>
				<p class="detail-meta">${escapeHtml(entry.setName)} · <span class="mono">${escapeHtml(entry.number)}</span></p>
			</div>
		</div>
		${message}`;
}

// Closes a saved card's page, if one is open, and shows the list again. Returns true when one was.
function closeSavedCard() {
	if (!savedPage) return false;
	savedPage = null;
	savedCardView.hidden = true;
	savedCardPanel.innerHTML = "";
	collectionPage.hidden = false;
	// The step the page added to the browser's history goes too, so Back doesn't stop there later.
	if (history.state && history.state.savedCard) history.back();
	return true;
}

// Back from a saved card's page to the list, where it was scrolled to: by the page's own Back
// button, the phone's Back, or the "My cards" button.
function backToList() {
	const page = savedPage;
	if (!closeSavedCard()) return;
	window.scrollTo(0, listScrolledTo);
	// Someone using a keyboard carries on from the card they opened.
	const opened = [...collectionList.querySelectorAll("[data-action='open']")]
		.find((button) => button.dataset.cardId === page.entry.id);
	if (opened) opened.focus({ preventScroll: true });
}

// Both card pages - the Scan screen's and a saved card's - drawn again, for news that may concern
// either, like PSA prices arriving (see gradedPricesHtml).
function renderCardPages() {
	renderResults();
	renderSavedCardPage();
}

// A phone may keep the start page for up to ten minutes (GitHub Pages), and then opens the version
// from before an update - with its old ways of finding cards and prices. So the newest start page is
// asked for, and when it names another version, the page is loaded again: once, so it can never go
// round in circles. Returns true when it is loading again.
const UPDATE_TRIED_KEY = "kortpris.updateTried";
let reloadingForUpdate = false;
async function reloadIfNewerVersion() {
	if (APP_VERSION === "dev") return false;
	try {
		// cache "reload" also puts the newest start page in the phone's kept copy.
		const response = await fetch(location.pathname, { cache: "reload" });
		const newest = ((await response.text()).match(/app\.js\?v=([0-9.]+)/) || [])[1];
		if (!newest || newest === APP_VERSION || sessionStorage.getItem(UPDATE_TRIED_KEY) === newest) return false;
		sessionStorage.setItem(UPDATE_TRIED_KEY, newest);
		reloadingForUpdate = true;
		location.reload();
		return true;
	} catch (error) {
		return false;   // offline, or the browser's storage is blocked: this version, as it is
	}
}

// Saved and learned cards from before version 1.32.0 get TCGdex's ids (see collection.js and
// learned.js). Quietly: if the database doesn't answer, it is tried again the next time.
function moveOldCardsToTcgdex() {
	if (reloadingForUpdate) return;
	moveSavedCardsToTcgdex().then((changed) => { if (changed) renderCollection(); }, (error) => console.error(error));
	moveLearnedToTcgdex().then((changed) => { if (changed) renderLearned(); }, (error) => console.error(error));
}

// ---------- Accounts ----------

function handleAccountChange(username) {
	if (stopWatchingCards) {
		stopWatchingCards();
		stopWatchingCards = null;
	}
	// The learned cards follow the account too (learned.js).
	if (stopWatchingLearned) {
		stopWatchingLearned();
		stopWatchingLearned = null;
	}
	useLearnedAccount(username);
	if (username) {
		stopWatchingLearned = watchAccountLearned(
			username,
			(photos) => {
				useAccountLearned(photos);
				renderLearned();
				moveOldCardsToTcgdex();
			},
			(error) => {
				console.error(error);
				learnedAccountFailed(error);
				renderLearned();
			},
		);
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
				moveOldCardsToTcgdex();
			},
			(error) => {
				console.error(error);
				setAccountMessage(accountProblem(error), "error");
			},
		);
	} else {
		usePhoneCollection();
	}
	renderLearned();
	claimPhoneClaudeKey();
	// The Claude box now shows another account (or none): nothing typed or said there carries over.
	claudeKeyInput.value = "";
	claudeMessageKey = null;
	renderAccount();
	renderCollection();
	renderResults();
	renderClaudeSettings();   // shown only while signed in, with that account's key
	moveOldCardsToTcgdex();   // the phone's cards were read again (an account's follow when they arrive)
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

function claudeReadingAllowed() {
	// Reading with Claude is only offered to someone signed in to an account, with that
	// account's own key (see claudeKey in claude.js). Signed out, the settings are hidden.
	return accountName !== null;
}

function renderClaudeSettings() {
	claudeSettings.hidden = !claudeReadingAllowed();
	const on = claudeKey() !== "";
	claudeState.textContent = t(on ? "claudeOn" : "claudeOff");
	claudeState.classList.toggle("on", on);
	claudeRemoveButton.hidden = !on;
	claudeMessage.textContent = claudeMessageKey ? t(claudeMessageKey) : "";
	claudeMessage.classList.toggle("error", claudeMessageKey === "claudeKeyShape" || claudeMessageKey === "claudeSaveFailed");
}

function setNotice(key, values = {}) {
	noticeMessage = key ? { key: key, values: values } : null;
	showNotice();
}

function showNotice() {
	notice.hidden = noticeMessage === null;
	notice.textContent = noticeMessage ? t(noticeMessage.key, noticeMessage.values) : "";
}

// ---------- Small helpers ----------

function setStatus(key, values = {}, tone = "") {
	const kidKeyBefore = KID_STATUS[statusMessage.key];
	statusMessage = { key, values, tone };
	showStatus();
	// In kids mode each new kind of message is also said out loud: once, not at every step.
	const kidKey = KID_STATUS[key];
	if (kidsMode && kidKey !== kidKeyBefore && KID_SPOKEN[kidKey]) say(t(KID_SPOKEN[kidKey]));
}

function showStatus() {
	const kidKey = kidsMode ? KID_STATUS[statusMessage.key] : null;
	statusText.textContent = kidKey
		? KID_STATUS_ICONS[kidKey] + " " + t(kidKey)
		: t(statusMessage.key, statusMessage.values);
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
