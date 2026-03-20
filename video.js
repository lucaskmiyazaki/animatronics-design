// videoControls.js

(function () {
    const canvas = document.getElementById('canvas');
    const canvasContainer = document.getElementById('canvas-container');

    if (!canvas) {
        console.error('Canvas with id="canvas" not found.');
        return;
    }

    if (!canvasContainer) {
        console.error('Container with id="canvas-container" not found.');
        return;
    }

    // ----- settings -----
    const DEFAULT_FPS = 30;
    const FRAME_STEP = 1 / DEFAULT_FPS;

    // ----- hidden file input -----
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    // ----- ensure canvas container can hold layered content -----
    if (!canvasContainer.style.position) {
        canvasContainer.style.position = 'relative';
    }
    canvasContainer.style.overflow = 'hidden';

    // ----- video behind canvas, only inside canvas side -----
    const video = document.createElement('video');
    video.id = 'backgroundVideo';
    video.playsInline = true;
    video.muted = true;
    video.preload = 'auto';

    Object.assign(video.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        zIndex: '0',
        background: 'black',
        pointerEvents: 'none'
    });

    // make sure canvas stays above video
    Object.assign(canvas.style, {
        position: 'relative',
        zIndex: '1',
        background: 'transparent'
    });

    // place video only inside canvas container
    canvasContainer.prepend(video);

    let currentVideoURL = null;
    let currentFrameIndex = 0;

    function syncCanvasFrame() {
        window.appActions?.setCurrentFrame?.(currentFrameIndex);
    }

    function openVideoPicker() {
        fileInput.value = '';
        fileInput.click();
    }

    function loadVideoFile(file) {
        if (!file) return;

        if (currentVideoURL) {
            URL.revokeObjectURL(currentVideoURL);
        }

        currentVideoURL = URL.createObjectURL(file);
        video.src = currentVideoURL;
        video.load();

        video.addEventListener(
            'loadeddata',
            async () => {
                try {
                    video.pause();
                    currentFrameIndex = 0;
                    video.currentTime = 0;
                    syncCanvasFrame();
                } catch (err) {
                    console.error('Could not initialize video:', err);
                }
            },
            { once: true }
        );
    }

    function clampTime(t) {
        if (!isFinite(video.duration) || isNaN(video.duration)) {
            return Math.max(0, t);
        }
        return Math.min(Math.max(0, t), video.duration);
    }

    function clampFrameIndex(frameIndex) {
        if (!isFinite(video.duration) || isNaN(video.duration)) {
            return Math.max(0, frameIndex);
        }

        const maxFrame = Math.floor(video.duration / FRAME_STEP);
        return Math.min(Math.max(0, frameIndex), maxFrame);
    }

    function showFrameIndex(frameIndex) {
        if (!video.src) return;

        currentFrameIndex = clampFrameIndex(frameIndex);
        video.pause();
        video.currentTime = clampTime(currentFrameIndex * FRAME_STEP);
        syncCanvasFrame();
    }

    function showFrameAt(time) {
        if (!video.src) return;

        video.pause();
        video.currentTime = clampTime(time);
        currentFrameIndex = Math.round(video.currentTime / FRAME_STEP);
        syncCanvasFrame();
    }

    function nextFrame() {
        if (!video.src) return;
        showFrameIndex(currentFrameIndex + 1);
    }

    function prevFrame() {
        if (!video.src) return;
        showFrameIndex(currentFrameIndex - 1);
    }

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        loadVideoFile(file);
    });

    window.videoControls = {
        openVideoPicker,
        loadVideoFile,
        nextFrame,
        prevFrame,
        showFrameAt,
        showFrameIndex,
        getCurrentFrameIndex: () => currentFrameIndex,
        video
    };
})();