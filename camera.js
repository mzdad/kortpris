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
// canLight }, where zoomRange is { min, max } or null when it can't zoom. Throws when the camera
// can't start: no camera, or the viewer didn't allow it (error.name "NotAllowedError").
async function startLiveCamera(video) {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: LIVE_PICTURE });
	video.srcObject = stream;
	await video.play();
	const track = stream.getVideoTracks()[0];
	const capabilities = track.getCapabilities ? track.getCapabilities() : {};
	return {
		stream: stream,
		track: track,
		zoomRange: capabilities.zoom && capabilities.zoom.max > 1 ? capabilities.zoom : null,
		canLight: Boolean(capabilities.torch),
	};
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
			if (bigger && sameWayUp) return { file: photo, source: "photo", width: width, height: height, photoNote: null };
			photoNote = { key: sameWayUp ? "cameraPhotoSmall" : "cameraPhotoSideways", values: { size: width + "×" + height } };
		} catch (error) {
			console.error(error);   // the live picture will do
			photoNote = { key: "cameraPhotoFailed", values: {} };
		}
	}
	const softness = softnessOf(steadiest);
	const sharpened = softness >= SOFT_FROM;
	if (sharpened) sharpen(steadiest);
	const file = await new Promise((resolve, reject) => {
		steadiest.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The camera gave no picture"))), "image/jpeg", PHOTO_JPEG_QUALITY);
	});
	const { width, height } = steadiest;
	freeCanvas(steadiest);
	return { file: file, source: "video", width: width, height: height, photoNote: photoNote, softness: softness, sharpened: sharpened };
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
	for (const track of camera.stream.getTracks()) track.stop();
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
