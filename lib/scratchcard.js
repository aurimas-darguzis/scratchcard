/* jshint browserify: true */

'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var defaults = require('lodash.defaults');

var Painter = Scratchcard.Painter = require('./painter');

module.exports = exports = Scratchcard;

var defaultOptions = {
	zIndex: 100,
	threshold: 255,
	realtime: false,
	painter: {},
	animationFrame: null
};

function Scratchcard(element, options) {
	if (isIeLessThan9()) {
		throw new Error('Internet Explorer not supported prior to version 9');
	}

	EventEmitter.call(this);

	var self = this;

	var canvas = document.createElement('canvas');
	if (!canvas.getContext) {
		throw new Error('HTML5 canvas not supported');
	}

	options = (options instanceof Painter) ?
		defaults({painter: options}, defaultOptions) :
		defaults({}, options, defaultOptions);

	var requestAnimationFrame = window.requestAnimationFrame;

	var animationFrame = options.animationFrame;
	if (animationFrame && animationFrame.request) {
		requestAnimationFrame = animationFrame.request.bind(animationFrame);
	}

	if (!requestAnimationFrame) {
		throw new Error('requestAnimationFrame not supported');
	}

	canvas.style.position = 'absolute';
	canvas.width = element.clientWidth;
	canvas.height = element.clientHeight;
	canvas.style.zIndex = options.zIndex;

	// Disable the blue overlay for some browsers
	canvas.style['-webkit-tap-highlight-color'] = 'rgba(0,0,0,0)';

	var wrapper = document.createElement('div');
	wrapper.className = 'scratchcard';
	wrapper.style.position = 'relative';
	wrapper.appendChild(canvas);
	element.parentNode.insertBefore(wrapper, element);

	var ctx = canvas.getContext('2d');
	var painter = null;

	var previousFingers = {};
	var previousFingersCount = 0;
	var currentFingers = {};
	var currentFingersCount = 0;

	var progress = null;

	this.getElement = getElement;
	this.setElement = setElement;
	this.getPainter = getPainter;
	this.setPainter = setPainter;
	this.getWrapper = getWrapper;
	this.getCanvas = getCanvas;

	this.reset = reset;
	this.complete = complete;
	this.getProgress = getProgress;

	setPainter(options.painter);
	element.style.visibility = 'visible';

	canvas.addEventListener('mousedown', onMouseDown, true);
	canvas.addEventListener('touchstart', onTouchStart, true);

	animate();

	function getElement() {
		return element;
	}

	function setElement(newElement) {
		element = newElement;
		element.parentNode.insertBefore(wrapper, element);
		reset();
	}

	function getPainter() {
		return painter;
	}

	function setPainter(newPainter) {
		painter = (newPainter instanceof Painter) ? newPainter : new Painter(newPainter);
		reset();
	}

	function getWrapper() {
		return wrapper;
	}

	function getCanvas() {
		return canvas;
	}

	function reset() {
		painter.reset(ctx, canvas.width, canvas.height);
		checkProgress();
	}

	function drawPoint(point) {
		painter.drawPoint(ctx, point);
	}

	function drawLine(start, end) {
		painter.drawLine(ctx, start, end);
	}

	function complete() {
		painter.complete(ctx, canvas.width, canvas.height);
		checkProgress();
	}

	function getProgress() {
		var width = canvas.width;
		var height = canvas.height;
		var pixels = width * height;
		var holes = 0;

		var data = ctx.getImageData(0, 0, width, height).data;

		for (var index = 3, count = data.length; index < count; index += 4) {
			if (data[index] >= options.threshold) {
				holes++;
			}
		}

		return (pixels - holes) / pixels;
	}

	function checkProgress() {
		var lastProgress = progress;
		progress = getProgress();

		if (progress !== lastProgress) {
			self.emit('progress', progress);
		}
	}

	function animate() {
		requestAnimationFrame(animate);

		if (wrapper.nextSibling !== element) {
			element.parentNode.insertBefore(wrapper, element);
		}

		if ((canvas.width !== element.clientWidth) || (canvas.height !== element.clientHeight)) {
			canvas.width = element.clientWidth;
			canvas.height = element.clientHeight;
			reset();
		}

		for (var identifier in currentFingers) {
			var previousFinger = previousFingers[identifier];
			var currentFinger = currentFingers[identifier];

			if (!previousFinger) {
				drawPoint(currentFinger);
			} else if ((currentFinger.x !== previousFinger.x) || (currentFinger.y !== previousFinger.y)) {
				drawLine(previousFinger, currentFinger);
			}
		}

		if (options.realtime || ((currentFingersCount === 0) && (previousFingersCount > 0))) {
			checkProgress();
		}

		previousFingers = currentFingers;
		previousFingersCount = currentFingersCount;
	}

	function onMouseDown(event) {
		if (event.button !== 0) {
			return;
		}

		event.preventDefault();

		// console.log('mousedown');
		var boundingRect = canvas.getBoundingClientRect();
		currentFingers = {
			mouse: {
				x: event.clientX - boundingRect.left,
				y: event.clientY - boundingRect.top
			}
		};
		currentFingersCount = 1;

		window.addEventListener('mousemove', onMouseMove, true);
		window.addEventListener('mouseup', onMouseUp, true);

		canvas.removeEventListener('mousedown', onMouseDown, true);
		canvas.removeEventListener('touchstart', onTouchStart, true);
	}

	function onMouseMove(event) {
		if (event.button !== 0) {
			return;
		}

		event.preventDefault();

		// console.log('mousemove');
		var boundingRect = canvas.getBoundingClientRect();
		currentFingers = {
			mouse: {
				x: event.clientX - boundingRect.left,
				y: event.clientY - boundingRect.top
			}
		};
		currentFingersCount = 1;
	}

	function onMouseUp(event) {
		if (event.button !== 0) {
			return;
		}

		event.preventDefault();

		// console.log('mouseup');
		currentFingers = {};
		currentFingersCount = 0;

		window.removeEventListener('mousemove', onMouseMove, true);
		window.removeEventListener('mouseup', onMouseUp, true);

		canvas.addEventListener('mousedown', onMouseDown, true);
		canvas.addEventListener('touchstart', onTouchStart, true);
	}

	function onTouchStart(event) {
		event.preventDefault();

		// console.log('touchstart');
		currentFingers = {};
		currentFingersCount = event.touches.length;

		var boundingRect = canvas.getBoundingClientRect();

		for (var index = 0; index < currentFingersCount; index++) {
			var touch = event.touches[index];

			currentFingers[touch.identifier] = {
				x: touch.clientX - boundingRect.left,
				y: touch.clientY - boundingRect.top
			};
		}

		window.addEventListener('touchstart', onTouch, true);
		window.addEventListener('touchmove', onTouch, true);
		window.addEventListener('touchend', onTouch, true);

		canvas.removeEventListener('mousedown', onMouseDown, true);
		canvas.removeEventListener('touchstart', onTouchStart, true);
	}

	function onTouch(event) {
		event.preventDefault();

		// console.log(event.type);
		currentFingers = {};
		currentFingersCount = event.touches.length;

		if (currentFingersCount > 0) {
			var boundingRect = canvas.getBoundingClientRect();

			for (var index = 0; index < currentFingersCount; index++) {
				var touch = event.touches[index];

				currentFingers[touch.identifier] = {
					x: touch.clientX - boundingRect.left,
					y: touch.clientY - boundingRect.top
				};
			}

		} else {
			window.removeEventListener('touchstart', onTouch, true);
			window.removeEventListener('touchmove', onTouch, true);
			window.removeEventListener('touchend', onTouch, true);

			canvas.addEventListener('mousedown', onMouseDown, true);
			canvas.addEventListener('touchstart', onTouchStart, true);
		}
	}
}

util.inherits(Scratchcard, EventEmitter);

function isIeLessThan9() {
	var div = document.createElement('div');
	div.innerHTML = '<!--[if lt IE 9]><i></i><![endif]-->';
	return (div.getElementsByTagName('i').length === 1);
}