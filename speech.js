"use strict";

// Reads text aloud with the phone's own built-in voice (the browser's speech synthesis), for
// children who can't read well yet. It costs nothing, and no text is sent anywhere.

// The voice's language for each app language.
const SPEECH_LANGUAGES = { da: "da-DK", en: "en-GB" };
// A little slower than normal, so children can follow.
const SPEECH_RATE = 0.9;

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
	utterance.lang = SPEECH_LANGUAGES[language] || language;
	const voice = voiceFor(utterance.lang);
	if (voice) utterance.voice = voice;
	utterance.rate = SPEECH_RATE;
	speechSynthesis.speak(utterance);
}

function voiceFor(languageTag) {
	// A voice for exactly that language ("da-DK"), or else any voice for it ("da"), or none:
	// then the phone picks one itself.
	const voices = speechSynthesis.getVoices();
	const wanted = languageTag.toLowerCase();
	const sameLanguage = (voice) => voice.lang.replace("_", "-").toLowerCase();
	return voices.find((voice) => sameLanguage(voice) === wanted)
		|| voices.find((voice) => sameLanguage(voice).startsWith(wanted.slice(0, 2)))
		|| null;
}
