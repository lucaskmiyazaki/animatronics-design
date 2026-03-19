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

// Create buttons
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
sidebar.append(buildButton, previewButton, exportButton);

// Add sidebar to page
document.body.appendChild(sidebar);