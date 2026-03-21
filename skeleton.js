class Point {
    constructor(x, y, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.lines = [];
    }
}

class Line {
    constructor(startPoint, endPoint) {
        this.start = startPoint;
        this.end = endPoint;

        this.originalLength = this.computeLength();
        this.length = this.originalLength;

        this.start.lines.push(this);
        this.end.lines.push(this);
    }

    getOtherPoint(point) {
        return point === this.start ? this.end : this.start;
    }

    computeDirection() {
        return {
            x: this.end.x - this.start.x,
            y: this.end.y - this.start.y,
            z: this.end.z - this.start.z
        };
    }

    computeLength() {
        const d = this.computeDirection();
        return Math.sqrt(d.x ** 2 + d.y ** 2 + d.z ** 2);
    }

    updateGeometry() {
        this.length = this.computeLength();
    }
}

class Skeleton {
    constructor() {
        this.points = [];
        this.lines = [];
    }

    addPoint(x, y, z = 0) {
        const p = new Point(x, y, z);
        this.points.push(p);
        return p;
    }

    addLine(p1, p2) {
        const l = new Line(p1, p2);
        this.lines.push(l);
        return l;
    }

    updatePoint(point, x, y, z = point.z) {
        point.x = x;
        point.y = y;
        point.z = z;

        point.lines.forEach(line => {
            line.updateGeometry();
        });
    }

    updateAllGeometry() {
        this.lines.forEach(line => line.updateGeometry());
    }

    movePoint(point, targetX, targetY, z = point.z, tolerance = 0.2) {
        const connected = point.lines;

        if (connected.length === 0) {
            this.updatePoint(point, targetX, targetY, z);
            return;
        }

        if (connected.length === 1) {
            const line = connected[0];
            const anchor = line.getOtherPoint(point);

            const minR = line.originalLength * (1 - tolerance);
            const maxR = line.originalLength * (1 + tolerance);

            let dx = targetX - anchor.x;
            let dy = targetY - anchor.y;
            let mag = Math.hypot(dx, dy);

            if (mag < 1e-8) {
                point.x = anchor.x + maxR;
                point.y = anchor.y;
                point.z = z;
                line.updateGeometry();
                return;
            }

            dx /= mag;
            dy /= mag;

            mag = Math.max(minR, Math.min(maxR, mag));

            point.x = anchor.x + dx * mag;
            point.y = anchor.y + dy * mag;
            point.z = z;

            line.updateGeometry();
            return;
        }

        if (connected.length === 2) {
            const l1 = connected[0];
            const l2 = connected[1];

            const c1 = l1.getOtherPoint(point);
            const c2 = l2.getOtherPoint(point);

            const r1Min = l1.originalLength * (1 - tolerance);
            const r1Max = l1.originalLength * (1 + tolerance);
            const r2Min = l2.originalLength * (1 - tolerance);
            const r2Max = l2.originalLength * (1 + tolerance);

            const candidate = this.findBestPointForTwoElasticConstraints(
                targetX, targetY,
                c1.x, c1.y, r1Min, r1Max,
                c2.x, c2.y, r2Min, r2Max
            );

            if (candidate) {
                point.x = candidate.x;
                point.y = candidate.y;
                point.z = z;

                l1.updateGeometry();
                l2.updateGeometry();
            }

            return;
        }

        // 3+ connected lines: not handled yet
    }

    isWithinRange(value, min, max, eps = 1e-8) {
        return value >= min - eps && value <= max + eps;
    }

    distance2D(x1, y1, x2, y2) {
        return Math.hypot(x2 - x1, y2 - y1);
    }

    projectPointToCircle(cx, cy, r, px, py) {
        let dx = px - cx;
        let dy = py - cy;
        let mag = Math.hypot(dx, dy);

        if (mag < 1e-8) {
            return { x: cx + r, y: cy };
        }

        dx /= mag;
        dy /= mag;

        return {
            x: cx + dx * r,
            y: cy + dy * r
        };
    }

    pointSatisfiesAnnulus(x, y, cx, cy, rMin, rMax) {
        const d = this.distance2D(cx, cy, x, y);
        return this.isWithinRange(d, rMin, rMax);
    }

    getCircleIntersections(x0, y0, r0, x1, y1, r1) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const d = Math.hypot(dx, dy);

        if (d < 1e-8) return [];
        if (d > r0 + r1) return [];
        if (d < Math.abs(r0 - r1)) return [];

        const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
        const h2 = r0 * r0 - a * a;

        if (h2 < -1e-8) return [];

        const h = Math.sqrt(Math.max(0, h2));

        const xm = x0 + (a * dx) / d;
        const ym = y0 + (a * dy) / d;

        const rx = -(dy * h) / d;
        const ry = (dx * h) / d;

        const p1 = { x: xm + rx, y: ym + ry };
        const p2 = { x: xm - rx, y: ym - ry };

        if (Math.abs(h) < 1e-8) return [p1];
        return [p1, p2];
    }

    findBestPointForTwoElasticConstraints(
        targetX, targetY,
        x1, y1, r1Min, r1Max,
        x2, y2, r2Min, r2Max
    ) {
        const candidates = [];

        const addCandidate = (p) => {
            if (!p) return;

            const ok1 = this.pointSatisfiesAnnulus(p.x, p.y, x1, y1, r1Min, r1Max);
            const ok2 = this.pointSatisfiesAnnulus(p.x, p.y, x2, y2, r2Min, r2Max);

            if (ok1 && ok2) {
                candidates.push(p);
            }
        };

        // 1) Target itself, if already valid
        addCandidate({ x: targetX, y: targetY });

        // 2) Projections onto each boundary circle toward target
        addCandidate(this.projectPointToCircle(x1, y1, r1Min, targetX, targetY));
        addCandidate(this.projectPointToCircle(x1, y1, r1Max, targetX, targetY));
        addCandidate(this.projectPointToCircle(x2, y2, r2Min, targetX, targetY));
        addCandidate(this.projectPointToCircle(x2, y2, r2Max, targetX, targetY));

        // 3) Intersections of all boundary circles
        const boundaryPairs = [
            [r1Min, r2Min],
            [r1Min, r2Max],
            [r1Max, r2Min],
            [r1Max, r2Max]
        ];

        boundaryPairs.forEach(([ra, rb]) => {
            const intersections = this.getCircleIntersections(x1, y1, ra, x2, y2, rb);
            intersections.forEach(addCandidate);
        });

        // 4) Fallback sampling if needed
        if (candidates.length === 0) {
            const samples = 180;

            [r1Min, r1Max].forEach(r => {
                for (let i = 0; i < samples; i++) {
                    const t = (i / samples) * Math.PI * 2;
                    addCandidate({
                        x: x1 + Math.cos(t) * r,
                        y: y1 + Math.sin(t) * r
                    });
                }
            });

            [r2Min, r2Max].forEach(r => {
                for (let i = 0; i < samples; i++) {
                    const t = (i / samples) * Math.PI * 2;
                    addCandidate({
                        x: x2 + Math.cos(t) * r,
                        y: y2 + Math.sin(t) * r
                    });
                }
            });
        }

        if (candidates.length === 0) return null;

        let best = candidates[0];
        let bestDist2 =
            (best.x - targetX) ** 2 +
            (best.y - targetY) ** 2;

        for (let i = 1; i < candidates.length; i++) {
            const p = candidates[i];
            const d2 =
                (p.x - targetX) ** 2 +
                (p.y - targetY) ** 2;

            if (d2 < bestDist2) {
                best = p;
                bestDist2 = d2;
            }
        }

        return best;
    }
}