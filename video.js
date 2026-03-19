// videoControls.js

(function () {
    const canvas = document.getElementById('canvas');
    if (!canvas) {
        console.error('Canvas with id="canvas" not found.');
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

    // ----- video behind canvas -----
    const video = document.createElement('video');
    video.id = 'backgroundVideo';
    video.playsInline = true;
    video.muted = true;
    video.preload = 'auto';

    Object.assign(video.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
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

    document.body.prepend(video);

    let currentVideoURL = null;

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
                    await video.pause();
                    video.currentTime = 0;
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

    function showFrameAt(time) {
        if (!video.src) return;
        video.pause();
        video.currentTime = clampTime(time);
    }

    function nextFrame() {
        if (!video.src) return;
        showFrameAt(video.currentTime + FRAME_STEP);
    }

    function prevFrame() {
        if (!video.src) return;
        showFrameAt(video.currentTime - FRAME_STEP);
    }

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        loadVideoFile(file);
    });

   

    // optional global access
    window.videoControls = {
        openVideoPicker,
        loadVideoFile,
        nextFrame,
        prevFrame,
        showFrameAt,
        video
    };
})();