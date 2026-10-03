"use strict";

// The app's own camera: the back camera's live picture in the page, zoomed in and with its light
// on, and a button that takes the photo. The phone's own camera screen (the file input with
// capture="environment" in index.html) can't be told to zoom or light up; a live camera in the
// page can, on iPhones from iOS 17 (zoom) and iOS 18 (light), and in Chrome on Android.
//
// The light is the camera's torch, on the whole time instead of flashing at the shutter: a shiny
// card then shows its glare spot before the photo is taken, and the phone can be tilted away from it.
//
// Zoomed in, the phone is held further from the card: the card is then sharp (phone cameras can't
// focus closer than about 10 to 20 cm) and the phone's shadow doesn't fall on it.

// What the camera starts with, until the viewer changes it (remembered on the phone).
const START_ZOOM = 2;
const START_LIGHT = true;
const CAMERA_ZOOM_STORAGE_KEY = "kortpris.cameraZoom";
const CAMERA_LIGHT_STORAGE_KEY = "kortpris.cameraLight";
// The back camera picked after looking for the one with the light (see openMainBackCamera).
const CAMERA_LENS_STORAGE_KEY = "kortpris.cameraLens";
// The zoom button switches between these.
const CAMERA_ZOOMS = [1, 2];
// The live picture is asked for this large: a 4K video picture is nearly as sharp as a photo.
// Phones that can't give that much give their largest.
const LIVE_WIDTH = 3840;
const LIVE_HEIGHT = 2160;
// What is asked of the camera: the back one, that large.
const LIVE_PICTURE = {
	facingMode: { ideal: "environment" },
	width: { ideal: LIVE_WIDTH },
	height: { ideal: LIVE_HEIGHT },
};
const PHOTO_JPEG_QUALITY = 0.92;
// Pressing the shutter shakes the phone, and a shaken picture smears the tiny numbers. So after the
// press, the live picture is looked at this many times over this long, and the sharpest kept.
const STEADY_LOOKS = 6;
const STEADY_WATCH_MS = 600;
// Sharpness is measured on a copy this wide, in the middle part of the picture (shares of it).
const SHARPNESS_WIDTH = 360;
const SHARPNESS_AREA = { x0: 0.2, x1: 0.8, y0: 0.2, y1: 0.8 };
// A live picture is softer than a photo, and the reader can't make out the tiny numbers on old
// cards in a soft picture. So a soft one is sharpened: each pixel's brightness pushed this much away
// from its surroundings' (an "unsharp mask")...
const SHARPEN_AMOUNT = 1.5;
// ...where the surroundings are a smooth blur of about 1.4 pixels (smoothBlur in reader.js) in a
// picture whose shorter side is this long, and proportionally wider in a bigger picture: the same
// softness spreads over twice as many pixels in an iPhone's 2160 x 3840 live picture. In
// dev-local/camera-lab.html (version 1.24.2), 8 real cards in slightly soft 4K pictures read 5
// numbers as they were, and all 8 sharpened...
const SHARPEN_RADIUS = 1;
const SHARPEN_TESTED_SIDE = 1080;
// ...but sharpening pictures that were sharp already turned 7 read numbers into 6. So only a picture
// at least this soft is sharpened (see softnessOf). Made-up camera pictures of 30 real cards
// measured 0.01 to 0.08 sharp, and 0.12 and up slightly soft (dev-local/softness-lab.html). The
// line is on the sharp side of the gap, to sharpen when in doubt: the live pictures that read badly
// were soft. With it, 10 old cards read 9 or 10 numbers from sharp and slightly soft pictures, 4K
// and 1080p alike - as many as from the phone's own photos (9).
const SOFT_FROM = 0.06;

// True when this browser can show a live camera in the page at all. It also needs https
// (or this computer, while testing).
function liveCameraPossible() {
	return window.isSecureContext && Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// Starts the back camera, shown in this <video>. Returns the camera: { stream, track, zoomRange,
// canLight, label, othersTried }, where zoomRange is { min, max } or null when it can't zoom, label is
// the browser's name for the camera ("camera2 0, facing back"), and othersTried how many other back
// cameras were tried for the light this time (see openMainBackCamera). Throws when the camera can't
// start: no camera, or the viewer didn't allow it (error.name "NotAllowedError").
async function startLiveCamera(video) {
	const { stream, othersTried } = await openMainBackCamera();
	video.srcObject = stream;
	await video.play();
	const track = stream.getVideoTracks()[0];
	const capabilities = track.getCapabilities ? track.getCapabilities() : {};
	return {
		stream: stream,
		track: track,
		zoomRange: capabilities.zoom && capabilities.zoom.max > 1 ? capabilities.zoom : null,
		canLight: Boolean(capabilities.torch),
		label: track.label,
		othersTried: othersTried,
	};
}

// A phone with several back cameras has its light by the main one, and the browser may give a page
// another: on a friend's Samsung phone in Chrome, the live picture had no light button and was grainy and
// blurry, where the phone's own camera was sharp - likely the wide-angle camera, which on many phones
// can't focus close up (version 1.68.0). So when the camera given has no light, and the browser can switch
// a light on at all, the other back cameras are tried, and the first with a light is used. What was found
// is remembered on the phone, so the looking is done once. Returns { stream, othersTried }.
async function openMainBackCamera() {
	const remembered = readStorage(CAMERA_LENS_STORAGE_KEY);
	if (remembered) {
		try {
			return { stream: await openCameraById(remembered), othersTried: 0 };
		} catch (error) {
			if (error.name === "NotAllowedError") throw error;
			removeStorage(CAMERA_LENS_STORAGE_KEY);   // that camera is gone, or its id changed: look again
		}
	}
	const first = await navigator.mediaDevices.getUserMedia({ audio: false, video: LIVE_PICTURE });
	if (hasLight(first) || !lightsPossible()) return { stream: first, othersTried: 0 };
	const firstId = first.getVideoTracks()[0].getSettings().deviceId;
	const others = await otherBackCameras(firstId);
	if (others.length === 0) return { stream: first, othersTried: 0 };
	// A phone may have only one camera open at a time: the first is closed while the others are tried.
	stopStream(first);
	let tried = 0;
	for (const id of others) {
		tried++;
		let stream;
		try {
			stream = await openCameraById(id);
		} catch (error) {
			console.error(error);   // this one can't be opened: the next is tried
			continue;
		}
		if (hasLight(stream)) {
			writeStorage(CAMERA_LENS_STORAGE_KEY, id);
			return { stream: stream, othersTried: tried };
		}
		stopStream(stream);
	}
	// None has a light: the first is as good as any, and is opened straight away from now on.
	writeStorage(CAMERA_LENS_STORAGE_KEY, firstId);
	return { stream: await openCameraById(firstId), othersTried: tried };
}

// Opens the camera with this id (from enumerateDevices), as large as LIVE_PICTURE asks.
function openCameraById(deviceId) {
	return navigator.mediaDevices.getUserMedia({
		audio: false,
		video: { deviceId: { exact: deviceId }, width: LIVE_PICTURE.width, height: LIVE_PICTURE.height },
	});
}

// The ids of the back cameras other than this one. Known only once the viewer has allowed the camera.
async function otherBackCameras(exceptId) {
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices.filter((device) => device.kind === "videoinput" && device.deviceId !== exceptId && facesBack(device))
		.map((device) => device.deviceId);
}

// True for a back camera: Chrome says so in its capabilities, and on Android in its name too
// ("camera2 2, facing back").
function facesBack(device) {
	const capabilities = device.getCapabilities ? device.getCapabilities() : {};
	return (capabilities.facingMode || []).includes("environment") || /facing back/i.test(device.label);
}

function hasLight(stream) {
	const track = stream.getVideoTracks()[0];
	return Boolean(track.getCapabilities && track.getCapabilities().torch);
}

// False in a browser that can't switch a camera's light on at all (Safari before iOS 18): then no
// camera has one, and looking would only take time.
function lightsPossible() {
	return Boolean(navigator.mediaDevices.getSupportedConstraints().torch);
}

function stopStream(stream) {
	for (const track of stream.getTracks()) track.stop();
}

// Sets the camera's zoom and light, as far as it can do them. The light only goes on once the
// live picture is running (iPhones ignore it before).
async function setLiveCamera(camera, zoom, light) {
	const wanted = {};
	if (camera.zoomRange) wanted.zoom = Math.min(Math.max(zoom, camera.zoomRange.min), camera.zoomRange.max);
	if (camera.canLight) wanted.torch = light;
	if (Object.keys(wanted).length === 0) return;
	// Each change replaces everything asked of the camera before, so the size is asked for again
	// (or it could drop to a small picture), and zoom and light are set together.
	try {
		await camera.track.applyConstraints({ ...LIVE_PICTURE, advanced: [wanted] });   // how Chrome takes them
	} catch (error) {
		console.error(error);
		await camera.track.applyConstraints({ ...LIVE_PICTURE, ...wanted });
	}
}

// Takes the photo: { file, source, width, height, photoNote, softness, sharpened }. source is "photo"
// for the camera's own full-size photo, which browsers with ImageCapture can take, or "video" for
// the sharpest live picture. photoNote says why the full-size photo wasn't used: a text key from
// strings.js plus its values. softness (see softnessOf) and sharpened are for live pictures. All of
// it is shown at the bottom of the page, to find out what a phone does.
async function takeLivePhoto(camera, video) {
	// The live pictures first: by the end of them the phone has steadied, which helps the photo too.
	const steadiest = await sharpestLivePicture(video);
	let photoNote = { key: "cameraNoPhoto", values: {} };
	if ("ImageCapture" in window) {
		try {
			const photo = await new ImageCapture(camera.track).takePhoto();
			const size = await createImageBitmap(photo);
			const { width, height } = size;
			size.close();
			// Only a photo that is bigger than the live picture, and the same way up as what was on the
			// screen: a photo turned on its side would hide the card's text from the reader.
			const bigger = width * height > steadiest.width * steadiest.height;
			const sameWayUp = (width > height) === (steadiest.width > steadiest.height);
			if (bigger && sameWayUp) {
				freeCanvas(steadiest);   // the live picture isn't needed: its memory goes back at once (see freeCanvas)
				return { file: photo, source: "photo", width: width, height: height, photoNote: null };
			}
			photoNote = { key: sameWayUp ? "cameraPhotoSmall" : "cameraPhotoSideways", values: { size: width + "×" + height } };
		} catch (error) {
			console.error(error);   // the live picture will do
			photoNote = { key: "cameraPhotoFailed", values: {} };
		}
	}
	return livePictureAsPhoto(steadiest, photoNote);
}

// A live picture (a canvas) as a photo, sharpened when it is soft (see SOFT_FROM): { file, source, width,
// height, photoNote, softness, sharpened }, as takeLivePhoto gives. The canvas's memory is let go of.
async function livePictureAsPhoto(picture, photoNote) {
	const softness = softnessOf(picture);
	const sharpened = softness >= SOFT_FROM;
	if (sharpened) sharpen(picture);
	const file = await new Promise((resolve, reject) => {
		picture.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The camera gave no picture"))), "image/jpeg", PHOTO_JPEG_QUALITY);
	});
	const { width, height } = picture;
	freeCanvas(picture);
	return { file: file, source: "video", width: width, height: height, photoNote: photoNote, softness: softness, sharpened: sharpened };
}

// Live scanning (Magic): the picture on the screen right now, as a photo - at once. takeLivePhoto waits
// 0.6 s for the sharpest of six pictures and asks the phone for its own full-size photo, which is what a
// single photo is worth; a card shown to the camera one after another is worth more quick looks, and a
// blurred one is simply read again (see watchLive in app.js).
async function grabLiveFrame(video) {
	const picture = document.createElement("canvas");
	picture.width = video.videoWidth;
	picture.height = video.videoHeight;
	picture.getContext("2d", { willReadFrequently: true }).drawImage(video, 0, 0);
	return livePictureAsPhoto(picture, null);
}

// The sharpest of a few live pictures over STEADY_WATCH_MS, as a canvas. Each is measured on a
// small copy, and only the sharpest so far is kept full size: a 4K picture takes 33 MB, and
// iPhones refuse to draw once a page's pictures take a few hundred.
async function sharpestLivePicture(video) {
	const best = document.createElement("canvas");
	best.width = video.videoWidth;
	best.height = video.videoHeight;
	const bestCtx = best.getContext("2d", { willReadFrequently: true });
	let bestSharpness = -1;
	for (let look = 0; look < STEADY_LOOKS; look++) {
		if (look > 0) await new Promise((resolve) => setTimeout(resolve, STEADY_WATCH_MS / STEADY_LOOKS));
		// Measured and kept in one go, with nothing to wait for in between, so both are the same picture.
		const sharpness = sharpnessOf(video, video.videoWidth, video.videoHeight);
		if (sharpness > bestSharpness) {
			bestCtx.drawImage(video, 0, 0);
			bestSharpness = sharpness;
		}
	}
	return best;
}

function freeCanvas(canvas) {
	// iPhones hand back a picture's memory straight away when it is shrunk to nothing, but only
	// much later when it is merely forgotten.
	canvas.width = 0;
	canvas.height = 0;
}

// How soft a picture is, from 0 (sharp) up: how much of its fine detail is left after blurring it a
// little more ("blur the blur"). A sharp picture loses most of its fine detail; a soft one has
// little to lose. Measured on a copy brought to the size the sharpening was tested at, in the middle.
function softnessOf(picture) {
	const scale = SHARPEN_TESTED_SIDE / Math.min(picture.width, picture.height);
	const width = Math.round(picture.width * scale);
	const height = Math.round(picture.height * scale);
	const copy = document.createElement("canvas");
	copy.width = width;
	copy.height = height;
	const ctx = copy.getContext("2d", { willReadFrequently: true });
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(picture, 0, 0, width, height);
	const pixels = ctx.getImageData(0, 0, width, height).data;
	freeCanvas(copy);
	const brightness = new Float32Array(width * height);
	for (let i = 0; i < brightness.length; i++) {
		brightness[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
	}
	const blurredMore = smoothBlur(brightness, width, height, SHARPEN_RADIUS);
	return fineDetail(blurredMore, width, height) / Math.max(fineDetail(brightness, width, height), 1e-6);
}

function fineDetail(values, width, height) {
	// The square of each pixel minus the average of its four neighbours, on average, in the middle
	// of the picture (SHARPNESS_AREA), where the card is.
	let total = 0;
	let count = 0;
	for (let y = Math.round(height * SHARPNESS_AREA.y0); y < height * SHARPNESS_AREA.y1; y++) {
		for (let x = Math.round(width * SHARPNESS_AREA.x0); x < width * SHARPNESS_AREA.x1; x++) {
			const i = y * width + x;
			const edge = 4 * values[i] - values[i - 1] - values[i + 1] - values[i - width] - values[i + width];
			total += edge * edge;
			count++;
		}
	}
	return total / count;
}

function sharpen(canvas) {
	// See SHARPEN_AMOUNT. Brightness only, so the colours stay as they were.
	const { width, height } = canvas;
	const radius = Math.max(SHARPEN_RADIUS, Math.round(SHARPEN_RADIUS * Math.min(width, height) / SHARPEN_TESTED_SIDE));
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	const image = ctx.getImageData(0, 0, width, height);
	const pixels = image.data;
	const brightness = new Float32Array(width * height);
	for (let i = 0; i < brightness.length; i++) {
		brightness[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
	}
	const surroundings = smoothBlur(brightness, width, height, radius);
	for (let i = 0; i < brightness.length; i++) {
		const push = SHARPEN_AMOUNT * (brightness[i] - surroundings[i]);
		// The pixels are an Uint8ClampedArray: anything below 0 or above 255 is kept at 0 or 255.
		pixels[i * 4] += push;
		pixels[i * 4 + 1] += push;
		pixels[i * 4 + 2] += push;
	}
	ctx.putImageData(image, 0, 0);
}

function sharpnessOf(picture, pictureWidth, pictureHeight) {
	// How much neighbouring pixels differ, on average: a blurred picture has soft edges everywhere.
	// (The square of each pixel minus the average of its four neighbours.)
	const width = SHARPNESS_WIDTH;
	const height = Math.round(pictureHeight * width / pictureWidth);
	const small = document.createElement("canvas");
	small.width = width;
	small.height = height;
	const ctx = small.getContext("2d", { willReadFrequently: true });
	ctx.drawImage(picture, 0, 0, width, height);
	const pixels = ctx.getImageData(0, 0, width, height).data;
	const brightness = (x, y) => {
		const i = (y * width + x) * 4;
		return 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
	};
	let total = 0;
	let count = 0;
	for (let y = Math.round(height * SHARPNESS_AREA.y0); y < height * SHARPNESS_AREA.y1; y++) {
		for (let x = Math.round(width * SHARPNESS_AREA.x0); x < width * SHARPNESS_AREA.x1; x++) {
			const edge = 4 * brightness(x, y) - brightness(x - 1, y) - brightness(x + 1, y) - brightness(x, y - 1) - brightness(x, y + 1);
			total += edge * edge;
			count++;
		}
	}
	freeCanvas(small);
	return total / count;
}

// Turns the camera (and its light) off.
function stopLiveCamera(camera, video) {
	stopStream(camera.stream);
	video.srcObject = null;
}

// The zoom and light the viewer chose last time, or what the camera starts with.
function chosenCameraZoom() {
	const saved = Number(readStorage(CAMERA_ZOOM_STORAGE_KEY));
	return CAMERA_ZOOMS.includes(saved) ? saved : START_ZOOM;
}

function chosenCameraLight() {
	const saved = readStorage(CAMERA_LIGHT_STORAGE_KEY);
	return saved === null ? START_LIGHT : saved === "on";
}

function chooseCameraZoom(zoom) {
	writeStorage(CAMERA_ZOOM_STORAGE_KEY, String(zoom));
}

function chooseCameraLight(on) {
	writeStorage(CAMERA_LIGHT_STORAGE_KEY, on ? "on" : "off");
}

// ---------- Taking the photo by itself ("Auto") ----------
// The live picture is looked at a few times a second, and the photo is taken once the card fills
// the white frame and the picture has stayed still for a moment (watchForCard in app.js decides).

// How often the live picture is looked at, and how small: finding the card in it takes a moment.
const AUTO_LOOK_MS = 250;
const AUTO_LOOK_WIDTH = 480;
// "Still" means the card's edges stayed put: between two looks, no edge may move more than this share
// of the card's size. (Comparing the whole picture didn't work: a real camera's grain and the
// smallest hand shake change it more than a card moving would.)
const STILL_MOVE = 0.03;
// ...for this many looks in a row: about a second, with the first look the card was seen in.
const AUTO_STILL_LOOKS = 3;
// A hand that never gets quite still still gets its photo: once the card has filled the frame this
// long, the photo is taken anyway.
const AUTO_LONGEST_WAIT_MS = 3000;
// After "Save and scan the next", the frame must first be empty for this many looks in a row: one
// look can miss a card that is there (or come while the camera's picture is still dark).
const AUTO_EMPTY_LOOKS = 2;
const CAMERA_AUTO_STORAGE_KEY = "kortpris.cameraAuto";
// Live scanning (Magic) reads a card sooner than Auto takes a photo, as the camera stays open and a
// card not read is simply read again: after the card has stayed still for this many looks in a row (the
// first look it was seen in doesn't count: 0.5 s), or has filled the frame this long, still or not.
const LIVE_STILL_LOOKS = 2;
const LIVE_LONGEST_WAIT_MS = 2000;
// A card not read at all is looked at again, up to this many reads. (One that found a list of prints to
// choose from isn't: an old card with no number to read gives the same list every time.)
const LIVE_MOST_TRIES = 2;
// A card read stays read while it is in the frame, nudged by a hand or not: it counts as another card once
// it has been out of the frame for a look, or moved this far (a share of its size) from where it was read -
// a card swapped by hand always does one or the other. (A picture of what is in the frame, to tell one card
// from another, couldn't: the same card moved 4% and a different card often looked as different as each
// other, and a card with the light changed more so, on the Magic photos' cards in a made-up camera.)
const LIVE_NEW_CARD_MOVE = 0.25;

// A look at the live picture: the card-shaped boxes found about the size and place of the white frame
// (findCardShapesInFrame in card-finder.js), whose place frameShares gives as shares of the picture.
// The boxes are shares of the picture too; none when there is no card in the frame.
function lookForCard(video, frameShares) {
	const width = AUTO_LOOK_WIDTH;
	const height = Math.round(video.videoHeight * width / video.videoWidth);
	const look = document.createElement("canvas");
	look.width = width;
	look.height = height;
	look.getContext("2d", { willReadFrequently: true }).drawImage(video, 0, 0, width, height);
	const frame = {
		x0: frameShares.x0 * width,
		x1: frameShares.x1 * width,
		y0: frameShares.y0 * height,
		y1: frameShares.y1 * height,
	};
	const boxes = findCardShapesInFrame(look, frame);
	freeCanvas(look);
	return boxes;
}

// Of the boxes found in a look, the one nearest where the card was in the look before (before), and
// how far that is (see cardMove): the card's own edges, a toploader's and a straight line in its
// picture can all make a card-shaped box, and following the same one keeps a still card still.
// Without a look before, the box with the clearest edges.
function nearestBox(before, boxes) {
	let nearest = { box: boxes[0], move: Infinity };
	if (!before) return nearest;
	for (const box of boxes) {
		const move = cardMove(before, box);
		if (move < nearest.move) nearest = { box: box, move: move };
	}
	return nearest;
}

// How far the card moved between two looks: the largest move of any of its four edges, as a share of
// the card's width (left and right edges) or height (top and bottom). Infinity when there was no
// look before.
function cardMove(before, after) {
	if (!before) return Infinity;
	const width = after.x1 - after.x0;
	const height = after.y1 - after.y0;
	return Math.max(
		Math.abs(after.x0 - before.x0) / width,
		Math.abs(after.x1 - before.x1) / width,
		Math.abs(after.y0 - before.y0) / height,
		Math.abs(after.y1 - before.y1) / height,
	);
}

// Whether the viewer switched live scanning (Magic) on or off; on until they switch it off.
const CAMERA_LIVE_STORAGE_KEY = "kortpris.cameraLive";
function chosenCameraLive() {
	return readStorage(CAMERA_LIVE_STORAGE_KEY) !== "off";
}

function chooseCameraLive(on) {
	writeStorage(CAMERA_LIVE_STORAGE_KEY, on ? "on" : "off");
}

// Whether the viewer switched "Auto" on or off, or null when they never did (then kids mode decides).
function chosenCameraAuto() {
	const saved = readStorage(CAMERA_AUTO_STORAGE_KEY);
	return saved === null ? null : saved === "on";
}

function chooseCameraAuto(on) {
	writeStorage(CAMERA_AUTO_STORAGE_KEY, on ? "on" : "off");
}
