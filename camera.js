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

// The photo as a file. Where the browser can, it is the camera's own full-size photo; otherwise
// (or when that comes out smaller) the live picture as it is.
async function takeLivePhoto(camera, video) {
	if ("ImageCapture" in window) {
		try {
			const photo = await new ImageCapture(camera.track).takePhoto();
			const size = await createImageBitmap(photo);
			const bigEnough = size.width * size.height >= video.videoWidth * video.videoHeight;
			size.close();
			if (bigEnough) return photo;
		} catch (error) {
			console.error(error);   // the live picture below will do
		}
	}
	const canvas = document.createElement("canvas");
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	canvas.getContext("2d").drawImage(video, 0, 0);
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The camera gave no picture"))), "image/jpeg", PHOTO_JPEG_QUALITY);
	});
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
