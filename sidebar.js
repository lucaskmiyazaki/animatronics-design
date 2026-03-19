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
    modeButton.textContent = mode === 'create'
        ? 'Mode: Create'
        : 'Mode: Edit';
}

modeButton.addEventListener('click', () => {
    window.appActions?.toggleMode?.();
    updateModeButton();
});

// Initialize label
updateModeButton();

// Create other buttons
const buildButton = createButton('Build Chain', () => {
    window.appActions?.buildChain();
});

const previewButton = createButton('Preview', () => {
    window.appActions?.playPreviewAnimation();
});

const exportButton = createButton('Export DXF', () => {
    window.appActions?.exportDXF();
});

// Add buttons to sidebar
sidebar.append(modeButton, buildButton, previewButton, exportButton);

// Add sidebar to page
document.body.appendChild(sidebar);