"use strict";

// Reading a card with Claude instead of the built-in text reader. Claude reads far more
// reliably - worn cards, foil glare, cards in other languages - but it needs the viewer's
// own Anthropic API key, and every photo costs a little on that account.

// The official Anthropic SDK, fetched from a CDN the first time Claude is used.
const CLAUDE_SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm";
const CLAUDE_MODEL = "claude-opus-5";
// Each account keeps its own key on this phone: "kortpris.claudeKey.<username>". Versions
// before 1.21.0 kept one key for the whole phone under the name without the username.
const CLAUDE_KEY_STORAGE_KEY = "kortpris.claudeKey";
// Claude Opus 5 sees up to 2576 pixels on a photo's long side. Sending that much keeps the
// tiny collector number readable. It is also the priciest size: about 4800 tokens per photo.
const CLAUDE_PHOTO_SIDE_PX = 2576;
const CLAUDE_JPEG_QUALITY = 0.85;
// The answer is a few lines of JSON; this leaves room for Claude to think first.
const CLAUDE_MAX_TOKENS = 16000;
// Reading a card is a simple job, so Claude is asked to think briefly: faster and cheaper.
const CLAUDE_EFFORT = "low";

// The exact shape Claude must answer in (structured output), so the app can always read it.
const CARD_ANSWER_SCHEMA = {
	type: "object",
	properties: {
		isPokemonCard: { type: "boolean" },
		name: { type: "string" },
		number: { type: "string" },
		setName: { type: "string" },
		finish: { type: "string", enum: ["normal", "holo", "reverse_holo"] },
	},
	required: ["isPokemonCard", "name", "number", "setName", "finish"],
	additionalProperties: false,
};

const CARD_READING_PROMPT = [
	"This photo should show one Pokémon trading card. Read it and fill in:",
	"- isPokemonCard: false if there is no Pokémon card in the photo.",
	"- name: the card's name as printed at the top, like \"Charizard\", \"Umbreon VMAX\" or",
	"  \"Professor's Research\". If the card is not in English, give its English name.",
	"- number: the collector number printed near the bottom, like \"4/102\", \"025/165\" or",
	"  \"TG05/TG30\". Copy it exactly, leading zeros included. Use \"\" if you can't read it.",
	"- setName: the English name of the card's set, if its set symbol or set code tells you.",
	"  Use \"\" if you are not sure.",
	"- finish: \"reverse_holo\" if the card sparkles or has a shiny pattern everywhere except the",
	"  picture; \"holo\" if the picture itself is shiny; otherwise \"normal\". This decides the price:",
	"  a reverse holo can be worth a hundred times the normal card.",
].join("\n");

let sdkPromise = null;
let client = null;
let clientKey = null;

function claudeKey() {
	// The signed-in account's key on this phone. Signed out, there is none.
	if (accountName === null) return "";
	return readStorage(accountKeyName()) || "";
}

// Returns true when it was saved (only possible while signed in).
function saveClaudeKey(key) {
	if (accountName === null) return false;
	return writeStorage(accountKeyName(), key);
}

function forgetClaudeKey() {
	if (accountName !== null) removeStorage(accountKeyName());
}

function accountKeyName() {
	return CLAUDE_KEY_STORAGE_KEY + "." + accountName;
}

function claimPhoneClaudeKey() {
	// A key saved before keys belonged to accounts goes to the first account that signs in on
	// this phone - most likely whoever saved it - unless that account has a key already.
	const oldKey = readStorage(CLAUDE_KEY_STORAGE_KEY);
	if (!oldKey || accountName === null) return;
	if (!claudeKey()) saveClaudeKey(oldKey);
	removeStorage(CLAUDE_KEY_STORAGE_KEY);
}

function looksLikeClaudeKey(key) {
	// Anthropic API keys start with "sk-ant-". This only catches obvious slips, like pasting
	// the wrong thing; whether the key really works shows on the first photo.
	return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key);
}

function loadSdk() {
	if (!sdkPromise) {
		sdkPromise = import(CLAUDE_SDK_URL);
		sdkPromise.catch(() => { sdkPromise = null; });   // allow a fresh try next photo
	}
	return sdkPromise;
}

async function claudeClient() {
	const sdk = await loadSdk();
	const key = claudeKey();
	if (!client || clientKey !== key) {
		client = new sdk.default({
			apiKey: key,
			// The SDK won't run in a web page unless told to, because a key inside a page can be
			// read by anyone using that page. Here the key is typed in by its owner, stays on
			// their own phone, and is only ever sent to Anthropic.
			dangerouslyAllowBrowser: true,
		});
		clientKey = key;
	}
	return client;
}

// Returns { isPokemonCard, name, number, setName, finish }. Throws when Claude can't be reached,
// doesn't accept the key, or declines - claudeProblem() turns the error into a message.
async function readCardWithClaude(imageFile) {
	const claude = await claudeClient();
	const photo = await photoAsJpegBase64(imageFile);
	const response = await claude.beta.messages.create({
		model: CLAUDE_MODEL,
		max_tokens: CLAUDE_MAX_TOKENS,
		// If a safety check declines the request, Anthropic re-runs it on its recommended
		// fallback model instead of just saying no.
		betas: ["server-side-fallback-2026-07-01"],
		fallbacks: "default",
		output_config: {
			effort: CLAUDE_EFFORT,
			format: { type: "json_schema", schema: CARD_ANSWER_SCHEMA },
		},
		messages: [{
			role: "user",
			content: [
				{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: photo } },
				{ type: "text", text: CARD_READING_PROMPT },
			],
		}],
	});
	// A decline arrives as a normal answer with stop_reason "refusal" and no usable content.
	if (response.stop_reason === "refusal") throw new Error("Claude declined to read the photo");
	const answer = response.content.find((block) => block.type === "text");
	if (!answer) throw new Error("Claude's answer had no text");
	return JSON.parse(answer.text);
}

async function photoAsJpegBase64(imageFile) {
	// createImageBitmap also turns sideways phone photos the right way up.
	const original = await createImageBitmap(imageFile);
	const scale = Math.min(1, CLAUDE_PHOTO_SIDE_PX / Math.max(original.width, original.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(original.width * scale);
	canvas.height = Math.round(original.height * scale);
	canvas.getContext("2d").drawImage(original, 0, 0, canvas.width, canvas.height);
	original.close();
	const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", CLAUDE_JPEG_QUALITY));
	// A data URL looks like "data:image/jpeg;base64,/9j/4AAQ..." - Claude wants only the part after the comma.
	const dataUrl = await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(jpeg);
	});
	return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

// Turns a failed Claude read into the text key (strings.js) of a message for the viewer.
async function claudeProblem(error) {
	console.error(error);
	let sdk = null;
	try {
		sdk = await loadSdk();
	} catch (loadError) {
		return "claudeFailed";   // the SDK itself couldn't be downloaded
	}
	if (error instanceof sdk.AuthenticationError || error instanceof sdk.PermissionDeniedError) return "claudeKeyWrong";
	if (error instanceof sdk.RateLimitError) return "claudeBusy";
	if (error instanceof sdk.BadRequestError && /credit/i.test(error.message)) return "claudeNoCredit";
	return "claudeFailed";
}
