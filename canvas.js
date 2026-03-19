const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const skeleton = new Skeleton();
const chain = new Chain();

let drawingFinished = false;
let isAnimating = false;

// Default trapezoid thickness
const trapezoidThickness = 50;

canvas.addEventListener('click', (e) => {
    if (drawingFinished) return;

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

    ctx.fillStyle = 'red';

    skeleton.points.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
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

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (e.key === 'Enter') {
        if (skeleton.points.length === 0) return;

        drawingFinished = true;

        chain.buildFromSkeleton(
            skeleton,
            trapezoidThickness,
            skeleton.points[0].x,
            skeleton.points[0].y
        );

        redrawAll();
    }

    if (key === 'q') {
        if (isAnimating) return;
        chain.resetToFlat();
        redrawAll();
    }

    if (key === 'w' && !e.repeat) {
        if (isAnimating) return;

        isAnimating = true;

        chain.resetToFlat();
        redrawAll();

        animateTowardsFinal(1000)
            .then(() => new Promise(resolve => setTimeout(resolve, 1000))) // wait 2s
            .then(() => {
                chain.resetToFlat();
                redrawAll();
                isAnimating = false;
            });
    }

    if (key === 'e') {
        if (isAnimating) return;
        chain.applyFinalLayout();
        redrawAll();
    }

    if (key === 'd' && !e.repeat) {
        chain.exportFlatDXF();
    }
});