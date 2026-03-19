const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const skeleton = new Skeleton();
const chain = new Chain();

let drawingFinished = false;
let isAnimating = false;
let hoveredPoint = null;
let draggedPoint = null;
let mode = 'create'; // 'create' or 'edit'

// Default trapezoid thickness
const trapezoidThickness = 50;
const pointRadius = 5;
const hoverRadius = 9;
const hitRadius = 10;

function getPointAt(x, y) {
    for (const point of skeleton.points) {
        const dx = x - point.x;
        const dy = y - point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= hitRadius) {
            return point;
        }
    }
    return null;
}

canvas.addEventListener('click', (e) => {
    if (drawingFinished) return;
    if (mode !== 'create') return;

    const x = e.clientX;
    const y = e.clientY;

    const newPoint = skeleton.addPoint(x, y);

    if (skeleton.points.length > 1) {
        skeleton.addLine(
            skeleton.points[skeleton.points.length - 2],
            newPoint
        );
    }

    draw();
});

canvas.addEventListener('mousedown', (e) => {
    if (drawingFinished) return;
    if (mode !== 'edit') return;

    const x = e.clientX;
    const y = e.clientY;

    draggedPoint = getPointAt(x, y);
});

canvas.addEventListener('mousemove', (e) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    hoveredPoint = getPointAt(mouseX, mouseY);

    if (mode === 'edit' && draggedPoint) {
        skeleton.updatePoint(draggedPoint, mouseX, mouseY);
    }

    redrawAll();
});

canvas.addEventListener('mouseup', () => {
    draggedPoint = null;
});

canvas.addEventListener('mouseleave', () => {
    hoveredPoint = null;
    draggedPoint = null;
    redrawAll();
});

function drawChain(chain) {
    chain.getTrapezoids().forEach(item => {
        const pts = item.trapezoid.getPoints(item.position, item.rotation);

        ctx.fillStyle = 'rgba(0,200,0,0.3)';
        ctx.strokeStyle = 'green';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);

        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }

        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 2;

    skeleton.lines.forEach(line => {
        ctx.beginPath();
        ctx.moveTo(line.start.x, line.start.y);
        ctx.lineTo(line.end.x, line.end.y);
        ctx.stroke();
    });

    skeleton.points.forEach(point => {
        const radius = point === hoveredPoint ? hoverRadius : pointRadius;

        ctx.beginPath();
        ctx.fillStyle = 'red';
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.fill();
    });
}

function redrawAll() {
    draw();
    drawChain(chain);
}

function shortestAngleDifference(from, to) {
    let diff = to - from;
    diff = ((diff + 180) % 360 + 360) % 360 - 180;
    return diff;
}

function animateTowardsFinal(duration = 1000) {
    if (chain.getTrapezoids().length === 0) {
        return Promise.resolve();
    }

    return new Promise(resolve => {
        const startTime = performance.now();

        const startStates = chain.getTrapezoids().map(item => ({
            x: item.position.x,
            y: item.position.y,
            rotation: item.rotation
        }));

        function step(now) {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);

            chain.getTrapezoids().forEach((item, i) => {
                const start = startStates[i];

                item.position.x =
                    start.x + (item.finalPosition.x - start.x) * t;

                item.position.y =
                    start.y + (item.finalPosition.y - start.y) * t;

                const dr = shortestAngleDifference(
                    start.rotation,
                    item.finalRotation
                );

                item.rotation = start.rotation + dr * t;
            });

            redrawAll();

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                resolve();
            }
        }

        requestAnimationFrame(step);
    });
}

function playPreviewAnimation() {
    if (isAnimating) return;
    if (chain.getTrapezoids().length === 0) return;

    isAnimating = true;

    chain.resetToFlat();
    redrawAll();

    animateTowardsFinal(1000)
        .then(() => new Promise(resolve => setTimeout(resolve, 1000)))
        .then(() => {
            chain.resetToFlat();
            redrawAll();
            isAnimating = false;
        });
}

function exportDXF() {
    chain.exportFlatDXF();
}

function buildChain() {
    if (skeleton.points.length === 0) return;

    drawingFinished = true;
    console.log(skeleton)
    chain.buildFromSkeleton(
        skeleton,
        trapezoidThickness,
        skeleton.points[0].x,
        skeleton.points[0].y
    );

    redrawAll();
}

function toggleMode() {
    mode = mode === 'create' ? 'edit' : 'create';
    draggedPoint = null;
    return mode;
}

function getMode() {
    return mode;
}

window.appActions = {
    playPreviewAnimation,
    exportDXF,
    buildChain,
    toggleMode,
    getMode
};
