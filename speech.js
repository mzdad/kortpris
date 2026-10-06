"use strict";

// Reads text aloud with the phone's own built-in voice (the browser's speech synthesis), for
// children who can't read well yet. It costs nothing, and no text is sent anywhere.
//
// How good it sounds depends on the voices the phone or PC has. Each has old robotic ones and
// often newer natural ones too, so the most natural voice is picked (see voiceScore), and the
// "Reading aloud" settings let a grown-up choose another and hear it first.

// The voice's language for each app language.
const SPEECH_LANGUAGES = { da: "da-DK", en: "en-GB" };
// A little slower than normal, so children can follow.
const SPEECH_RATE = 0.9;
// The voice chosen in the settings, per language, kept on this phone: "kortpris.voice.da".
const VOICE_STORAGE_PREFIX = "kortpris.voice.";
// Words in a voice's name that tell how natural it sounds, with points: Microsoft Edge's
// "Online (Natural)" voices, Apple's downloadable "Premium" and "Enhanced" voices (on a Danish
// iPhone "Forbedret"), and Google's voices in Chrome and on Android. Apple's joke voices and
// its old "Eloquence" voices (Eddy, Flo, Grandma...) sound robotic, so they lose points.
const VOICE_NAME_POINTS = [
	{ words: /natural|neural|premium/i, points: 4 },
	{ words: /enhanced|forbedret|online/i, points: 3 },
	{ words: /google/i, points: 2 },
	{ words: /\b(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|albert|fred|junior|kathy|ralph|zarvox|trinoids|whisper|wobble|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|bad news|good news)\b/i, points: -5 },
];
// A voice for the exact country (Danish from Denmark, British English) gets this much extra.
const SAME_COUNTRY_POINTS = 1;
// The settings' "the phone's own voice": the page names no voice and only says the language, so the
// phone speaks with the voice it has set for that language. A phone may keep its best voices from the
// page (an iPhone leaves out the downloaded "Enhanced" and "Premium" ones), so choosing from the list
// can never reach them, but the phone's own choice can.
const PHONE_VOICE = "phone";
// English can also ask for another country's English: "phone:en-US". An iPhone keeps one chosen voice for
// each country (Settings, Voices, English, United States...), and asking for British English never gets
// the voice that was chosen under the United States.
const PHONE_VOICE_COUNTRY_PREFIX = "phone:";
const PHONE_VOICE_TAGS = { en: ["en-US", "en-AU", "en-IE", "en-IN", "en-ZA"] };

function canSpeak() {
	return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

// Phones load their list of voices a moment after the page; asking once starts that early.
if (canSpeak()) speechSynthesis.getVoices();

function speak(text, language) {
	// Says text in "da" or "en", cutting off whatever was being said before.
	// iPhones only allow speech that starts with a tap, so the first call must come from a
	// button press; after that the page may speak on its own.
	if (!canSpeak() || !text) return;
	speechSynthesis.cancel();
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = speechTag(language);
	const voice = voiceFor(language);
	if (voice) utterance.voice = voice;
	utterance.rate = SPEECH_RATE;
	speechSynthesis.speak(utterance);
}

// Every voice for "da" or "en" that this phone has, most natural first.
function voicesFor(language) {
	if (!canSpeak()) return [];
	const wanted = (SPEECH_LANGUAGES[language] || language).toLowerCase();
	return speechSynthesis.getVoices()
		.filter((voice) => voiceLanguage(voice).startsWith(wanted.slice(0, 2)))
		.map((voice, order) => ({ voice, order, score: voiceScore(voice, wanted) }))
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.map((entry) => entry.voice);
}

function voiceFor(language) {
	// The voice chosen in the settings, if this phone still has it; else the most natural one.
	// None at all (or the phone's own chosen): the phone picks one itself.
	const chosen = chosenVoiceName(language);
	if (isPhoneVoice(chosen)) return null;
	const voices = voicesFor(language);
	return voices.find((voice) => voice.name === chosen) || voices[0] || null;
}

function isPhoneVoice(chosen) {
	return chosen === PHONE_VOICE || chosen.startsWith(PHONE_VOICE_COUNTRY_PREFIX);
}

// The language tag a text is spoken in: the app's usual one ("da-DK", "en-GB"), or the country picked
// together with "the phone's own voice" ("phone:en-US").
function speechTag(language) {
	const chosen = chosenVoiceName(language);
	if (chosen.startsWith(PHONE_VOICE_COUNTRY_PREFIX)) {
		const tag = chosen.slice(PHONE_VOICE_COUNTRY_PREFIX.length);
		if ((PHONE_VOICE_TAGS[language] || []).includes(tag)) return tag;
	}
	return SPEECH_LANGUAGES[language] || language;
}

// What the phone lets the page use, as one short line for the footer (see SHOWS_VOICE_DETAILS): how many
// voices, the first names, the countries they are for, and which one is used:
// "da-DK 1 (Sara) [da-DK] → Sara", "en-GB 5 (Daniel, Kate, Eddy, …) [en-GB en-US] → the phone's own voice (en-US)".
function voiceReport(language, phoneOwnText) {
	const voices = voicesFor(language);
	const shown = voices.slice(0, 3).map((voice) => voice.name.replace(/\s+-\s+.*$/, "")).join(", ");
	const countries = [...new Set(voices.map((voice) => voice.lang.replace("_", "-")))].join(" ");
	const used = voiceFor(language);
	return (SPEECH_LANGUAGES[language] || language) + " " + voices.length
		+ (voices.length > 0 ? " (" + shown + (voices.length > 3 ? ", …" : "") + ") [" + countries + "]" : "")
		+ " → " + (used ? used.name.replace(/\s+-\s+.*$/, "") : phoneOwnText + " (" + speechTag(language) + ")");
}

function voiceScore(voice, wantedTag) {
	let score = voiceLanguage(voice) === wantedTag ? SAME_COUNTRY_POINTS : 0;
	for (const rule of VOICE_NAME_POINTS) {
		if (rule.words.test(voice.name)) score += rule.points;
	}
	return score;
}

function voiceLanguage(voice) {
	return voice.lang.replace("_", "-").toLowerCase();   // Android writes "da_DK"
}

function chosenVoiceName(language) {
	return readStorage(VOICE_STORAGE_PREFIX + language) || "";
}

function chooseVoice(language, name) {
	// name "" means: pick the most natural one automatically.
	if (name) writeStorage(VOICE_STORAGE_PREFIX + language, name);
	else removeStorage(VOICE_STORAGE_PREFIX + language);
}
