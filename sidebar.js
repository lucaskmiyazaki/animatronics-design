// Create sidebar container
const sidebar = document.createElement('div');
sidebar.id = 'sidebar';

// Helper to create buttons
function createButton(label, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
}

// MODE TOGGLE BUTTON
const modeButton = document.createElement('button');

function updateModeButton() {
    const mode = window.appActions?.getMode?.() || 'create';

    if (mode === 'create') {
        modeButton.textContent = 'Mode: Create';
    } else if (mode === 'edit') {
        modeButton.textContent = 'Mode: Edit';
    } else if (mode === 'move') {
        modeButton.textContent = 'Mode: Move';
    }
}

modeButton.addEventListener('click', () => {
    window.appActions?.toggleMode?.();
    updateModeButton();
});

// Initialize label
updateModeButton();

const buildButton = createButton('Build Chain', () => {
    window.appActions?.createChainFromSkeleton(40);
    window.appActions?.drawChains3DForAllBranches(40);
});

const previewButton = createButton('Preview', () => {
    window.appActions?.playPreviewAnimation();
});

const exportButton = createButton('Export DXF', () => {
    window.appActions?.exportDXF();
});

const uploadVideoButton = createButton('Upload Video', () => {
    window.videoControls?.openVideoPicker();
});

const prevFrameButton = createButton('Prev Frame', () => {
    window.videoControls?.prevFrame();
    window.appActions?.drawSkeleton3D();
});

const nextFrameButton = createButton('Next Frame', () => {
    window.videoControls?.nextFrame();
    window.appActions?.drawSkeleton3D();
});

const CopyButton = createButton('Copy Prev', () => {
    window.appActions?.copyPreviousFrameSkeleton();
});

const renderSkeletonButton = createButton('Render Skeleton', () => {
    window.appActions?.drawSkeleton3D();
});

// Add buttons to sidebar
sidebar.append(
    modeButton,
    uploadVideoButton,
    prevFrameButton,
    nextFrameButton,
    CopyButton,
    renderSkeletonButton,
    buildButton,
);

// Add sidebar to page
document.body.appendChild(sidebar);