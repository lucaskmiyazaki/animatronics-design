class Point {
    constructor(x, y, z = 0, diameter = 10) {
        this.x = x;
        this.y = y;
        this.z = z;

        this.diameter = diameter; // thickness of the mesh at this point
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

class Branch {
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

    updatePoint(point, x, y, z = point.z, skeleton = null) {
        const oldX = point.x, oldY = point.y, oldZ = point.z ?? 0;
        point.x = x;
        point.y = y;
        point.z = z;

        point.lines.forEach(line => {
            line.updateGeometry();
            
            // Move any branches connected to this line when in edit mode
            if (skeleton) {
                this._moveLinkedBranches(skeleton, line, x - oldX, y - oldY, (z ?? 0) - oldZ);
            }
        });
    }

    updateAllGeometry() {
        this.lines.forEach(line => line.updateGeometry());
    }

    movePoint(point, targetX, targetY, targetZ = point.z, tolerance = 0.2, skeleton = null) {
        // Check if this is the first point of a linked branch
        if (skeleton && this.points.length > 0 && this.points[0] === point) {
            const branchIndex = skeleton.branches.indexOf(this);
            if (branchIndex !== -1 && skeleton.connections && 
                skeleton.connections.some(conn => conn.fromBranch === branchIndex)) {
                return; // Cannot move first point of linked branch directly
            }
        }

        const connected = point.lines;

        if (connected.length === 0) {
            this.updatePoint(point, targetX, targetY, targetZ);
            return;
        }

        if (connected.length === 1) {
            const line = connected[0];
            const anchor = line.getOtherPoint(point);

            const minR = line.originalLength * (1 - tolerance);
            const maxR = line.originalLength * (1 + tolerance);

            const candidate = this.projectPointToSphereShell(
                { x: anchor.x, y: anchor.y, z: anchor.z ?? 0 },
                minR,
                maxR,
                { x: targetX, y: targetY, z: targetZ }
            );

            const oldX = point.x, oldY = point.y, oldZ = point.z;
            point.x = candidate.x;
            point.y = candidate.y;
            point.z = candidate.z;
            line.updateGeometry();

            // Move any branches connected to this line
            if (skeleton) {
                this._moveLinkedBranches(skeleton, line, candidate.x - oldX, candidate.y - oldY, candidate.z - oldZ);
            }
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

            const candidate = this.findBestPointForTwoElasticConstraints3D(
                { x: targetX, y: targetY, z: targetZ },
                { x: c1.x, y: c1.y, z: c1.z ?? 0 }, r1Min, r1Max,
                { x: c2.x, y: c2.y, z: c2.z ?? 0 }, r2Min, r2Max
            );

            if (candidate) {
                const oldX = point.x, oldY = point.y, oldZ = point.z;
                point.x = candidate.x;
                point.y = candidate.y;
                point.z = candidate.z;

                l1.updateGeometry();
                l2.updateGeometry();

                // Move any branches connected to these lines
                if (skeleton) {
                    this._moveLinkedBranches(skeleton, l1, candidate.x - oldX, candidate.y - oldY, candidate.z - oldZ);
                    this._moveLinkedBranches(skeleton, l2, candidate.x - oldX, candidate.y - oldY, candidate.z - oldZ);
                }
            }

            return;
        }

        // 3+ connected lines: not handled yet
    }

    movePointXYLockedZ(point, targetX, targetY, z = point.z, tolerance = 0.2, skeleton = null) {
        // Check if this is the first point of a linked branch
        if (skeleton && this.points.length > 0 && this.points[0] === point) {
            const branchIndex = skeleton.branches.indexOf(this);
            if (branchIndex !== -1 && skeleton.connections && 
                skeleton.connections.some(conn => conn.fromBranch === branchIndex)) {
                return; // Cannot move first point of linked branch directly
            }
        }

        const connected = point.lines;

        if (connected.length === 0) {
            this.updatePoint(point, targetX, targetY, z);
            return;
        }

        if (connected.length === 1) {
            const line = connected[0];
            const anchor = line.getOtherPoint(point);

            const dz = z - (anchor.z ?? 0);
            const minR3 = line.originalLength * (1 - tolerance);
            const maxR3 = line.originalLength * (1 + tolerance);

            if (Math.abs(dz) > maxR3) return;

            const minR2 = Math.sqrt(Math.max(0, minR3 * minR3 - dz * dz));
            const maxR2 = Math.sqrt(Math.max(0, maxR3 * maxR3 - dz * dz));

            let dx = targetX - anchor.x;
            let dy = targetY - anchor.y;
            let mag = Math.hypot(dx, dy);

            if (mag < 1e-8) {
                const oldX = point.x, oldY = point.y;
                point.x = anchor.x + maxR2;
                point.y = anchor.y;
                point.z = z;
                line.updateGeometry();
                if (skeleton) {
                    this._moveLinkedBranches(skeleton, line, point.x - oldX, point.y - oldY, 0);
                }
                return;
            }

            dx /= mag;
            dy /= mag;

            mag = this.clamp(mag, minR2, maxR2);

            const oldX = point.x, oldY = point.y;
            point.x = anchor.x + dx * mag;
            point.y = anchor.y + dy * mag;
            point.z = z;

            line.updateGeometry();
            if (skeleton) {
                this._moveLinkedBranches(skeleton, line, point.x - oldX, point.y - oldY, 0);
            }
            return;
        }

        if (connected.length === 2) {
            const l1 = connected[0];
            const l2 = connected[1];

            const c1 = l1.getOtherPoint(point);
            const c2 = l2.getOtherPoint(point);

            const dz1 = z - (c1.z ?? 0);
            const dz2 = z - (c2.z ?? 0);

            const r1Min3 = l1.originalLength * (1 - tolerance);
            const r1Max3 = l1.originalLength * (1 + tolerance);
            const r2Min3 = l2.originalLength * (1 - tolerance);
            const r2Max3 = l2.originalLength * (1 + tolerance);

            if (Math.abs(dz1) > r1Max3 || Math.abs(dz2) > r2Max3) return;

            const r1Min2 = Math.sqrt(Math.max(0, r1Min3 * r1Min3 - dz1 * dz1));
            const r1Max2 = Math.sqrt(Math.max(0, r1Max3 * r1Max3 - dz1 * dz1));
            const r2Min2 = Math.sqrt(Math.max(0, r2Min3 * r2Min3 - dz2 * dz2));
            const r2Max2 = Math.sqrt(Math.max(0, r2Max3 * r2Max3 - dz2 * dz2));

            const candidate = this.findBestPointForTwoElasticConstraints2D(
                targetX, targetY,
                c1.x, c1.y, r1Min2, r1Max2,
                c2.x, c2.y, r2Min2, r2Max2
            );

            if (candidate) {
                const oldX = point.x, oldY = point.y;
                point.x = candidate.x;
                point.y = candidate.y;
                point.z = z;

                l1.updateGeometry();
                l2.updateGeometry();

                if (skeleton) {
                    this._moveLinkedBranches(skeleton, l1, candidate.x - oldX, candidate.y - oldY, 0);
                    this._moveLinkedBranches(skeleton, l2, candidate.x - oldX, candidate.y - oldY, 0);
                }
            }

            return;
        }

        // 3+ connected lines: not handled yet
    }

    removeLastPoint() {
        if (!this.points || this.points.length === 0) return null;

        const lastPoint = this.points[this.points.length - 1];

        // remove connected lines from this branch
        this.lines = this.lines.filter(line => {
            const usesPoint = line.start === lastPoint || line.end === lastPoint;

            if (usesPoint) {
                line.start.lines = line.start.lines.filter(l => l !== line);
                line.end.lines = line.end.lines.filter(l => l !== line);
            }

            return !usesPoint;
        });

        this.points.pop();
        return lastPoint;
    }

    _moveLinkedBranches(skeleton, line, dx, dy, dz) {
        if (!skeleton || !skeleton.connections) {
            return;
        }

        const branchIndex = skeleton.branches.indexOf(this);
        if (branchIndex === -1) {
            return;
        }
        const lineIndex = this.lines.indexOf(line);
        if (lineIndex === -1) {
            return;
        }

        // Find all branches connected to this line
        skeleton.connections.forEach((conn) => {
            if (conn.toBranch === branchIndex && conn.lineIndex === lineIndex) {
                const linkedBranch = skeleton.branches[conn.fromBranch];
                if (linkedBranch && linkedBranch.points.length > 0) {
                    // Calculate new projection point on the line at parameter t
                    const t = conn.t;
                    const start = line.start;
                    const end = line.end;
                    const newProj = {
                        x: start.x + (end.x - start.x) * t,
                        y: start.y + (end.y - start.y) * t,
                        z: (start.z ?? 0) + ((end.z ?? 0) - (start.z ?? 0)) * t
                    };

                    // Calculate offset from first point's current position to where it should be
                    const firstPoint = linkedBranch.points[0];
                    const offsetX = newProj.x - firstPoint.x;
                    const offsetY = newProj.y - firstPoint.y;
                    const offsetZ = newProj.z - (firstPoint.z ?? 0);

                    // Move all points in the linked branch to maintain relative position
                    linkedBranch.points.forEach(p => {
                        p.x += offsetX;
                        p.y += offsetY;
                        p.z = (p.z ?? 0) + offsetZ;
                    });
                    linkedBranch.updateAllGeometry();
                    skeleton.updateConnections();
                }
            }
        });
    }

    sub3(a, b) {
        return {
            x: a.x - b.x,
            y: a.y - b.y,
            z: a.z - b.z
        };
    }

    add3(a, b) {
        return {
            x: a.x + b.x,
            y: a.y + b.y,
            z: a.z + b.z
        };
    }

    mul3(v, s) {
        return {
            x: v.x * s,
            y: v.y * s,
            z: v.z * s
        };
    }

    dot3(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    cross3(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    mag3(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    }

    normalize3(v) {
        const m = this.mag3(v);
        if (m < 1e-8) return { x: 1, y: 0, z: 0 };
        return {
            x: v.x / m,
            y: v.y / m,
            z: v.z / m
        };
    }

    distance3(a, b) {
        return this.mag3(this.sub3(b, a));
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    isWithinRange(value, min, max, eps = 1e-8) {
        return value >= min - eps && value <= max + eps;
    }

    projectPointToSphereShell(center, rMin, rMax, target) {
        let dir = this.sub3(target, center);
        let d = this.mag3(dir);

        if (d < 1e-8) {
            return { x: center.x + rMax, y: center.y, z: center.z };
        }

        dir = this.normalize3(dir);
        const r = this.clamp(d, rMin, rMax);

        return this.add3(center, this.mul3(dir, r));
    }

    pointSatisfiesShell(point, center, rMin, rMax) {
        const d = this.distance3(center, point);
        return this.isWithinRange(d, rMin, rMax);
    }

    findBestPointForTwoElasticConstraints3D(target, c1, r1Min, r1Max, c2, r2Min, r2Max) {
        const candidates = [];

        const addCandidate = (p) => {
            if (!p) return;

            const ok1 = this.pointSatisfiesShell(p, c1, r1Min, r1Max);
            const ok2 = this.pointSatisfiesShell(p, c2, r2Min, r2Max);

            if (ok1 && ok2) {
                candidates.push(p);
            }
        };

        addCandidate(target);
        addCandidate(this.projectPointToSphereShell(c1, r1Min, r1Max, target));
        addCandidate(this.projectPointToSphereShell(c2, r2Min, r2Max, target));

        const radiusPairs = [
            [r1Min, r2Min],
            [r1Min, r2Max],
            [r1Max, r2Min],
            [r1Max, r2Max]
        ];

        for (const [ra, rb] of radiusPairs) {
            const samples = this.sampleSphereIntersectionCircle(c1, ra, c2, rb, 120);
            for (const p of samples) {
                addCandidate(p);
            }
        }

        if (candidates.length === 0) return null;

        let best = candidates[0];
        let bestDist2 =
            (best.x - target.x) ** 2 +
            (best.y - target.y) ** 2 +
            (best.z - target.z) ** 2;

        for (let i = 1; i < candidates.length; i++) {
            const p = candidates[i];
            const d2 =
                (p.x - target.x) ** 2 +
                (p.y - target.y) ** 2 +
                (p.z - target.z) ** 2;

            if (d2 < bestDist2) {
                best = p;
                bestDist2 = d2;
            }
        }

        return best;
    }

    sampleSphereIntersectionCircle(c1, r1, c2, r2, samples = 120) {
        const result = [];

        const diff = this.sub3(c2, c1);
        const d = this.mag3(diff);

        if (d < 1e-8) return result;
        if (d > r1 + r2) return result;
        if (d < Math.abs(r1 - r2)) return result;

        const ex = this.normalize3(diff);

        const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const h2 = r1 * r1 - a * a;
        if (h2 < -1e-8) return result;

        const h = Math.sqrt(Math.max(0, h2));
        const center = this.add3(c1, this.mul3(ex, a));

        let temp = Math.abs(ex.x) < 0.9
            ? { x: 1, y: 0, z: 0 }
            : { x: 0, y: 1, z: 0 };

        let u = this.cross3(ex, temp);
        if (this.mag3(u) < 1e-8) {
            temp = { x: 0, y: 0, z: 1 };
            u = this.cross3(ex, temp);
        }

        u = this.normalize3(u);
        const v = this.normalize3(this.cross3(ex, u));

        if (h < 1e-8) {
            result.push(center);
            return result;
        }

        for (let i = 0; i < samples; i++) {
            const t = (i / samples) * Math.PI * 2;
            const p = this.add3(
                center,
                this.add3(
                    this.mul3(u, Math.cos(t) * h),
                    this.mul3(v, Math.sin(t) * h)
                )
            );
            result.push(p);
        }

        return result;
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

    findBestPointForTwoElasticConstraints2D(
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

        addCandidate({ x: targetX, y: targetY });

        addCandidate(this.projectPointToCircle(x1, y1, r1Min, targetX, targetY));
        addCandidate(this.projectPointToCircle(x1, y1, r1Max, targetX, targetY));
        addCandidate(this.projectPointToCircle(x2, y2, r2Min, targetX, targetY));
        addCandidate(this.projectPointToCircle(x2, y2, r2Max, targetX, targetY));

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

// Minimal top-level Skeleton that stores Branch instances and simple connections
class Skeleton {
    constructor() {
        this.branches = []; // array of Branch
        // connections: { fromBranch: idx, toBranch: idx, lineIndex: idx, t: 0..1, proj: {x,y,z} }
        this.connections = [];
    }

    addBranch(branch) {
        if (branch instanceof Branch) {
            this.branches.push(branch);
            return branch;
        }
        const b = new Branch();
        this.branches.push(b);
        return b;
    }

    removeBranch(branchIndex) {
        if (
            branchIndex < 0 ||
            branchIndex >= this.branches.length
        ) {
            return false;
        }

        this.branches.splice(branchIndex, 1);

        // remove connections involving this branch
        this.connections = this.connections
            .filter(conn => conn.fromBranch !== branchIndex && conn.toBranch !== branchIndex)
            .map(conn => ({
                ...conn,
                fromBranch: conn.fromBranch > branchIndex ? conn.fromBranch - 1 : conn.fromBranch,
                toBranch: conn.toBranch > branchIndex ? conn.toBranch - 1 : conn.toBranch
            }));

        return true;
    }

    clear() {
        this.branches = [];
        this.connections = [];
    }

    // Connect the first point (index 0) of branchA to a line of branchB and store projection.
    connectFirstPointToLine(branchA, branchB, lineIndex) {
        const a = typeof branchA === 'number' ? this.branches[branchA] : branchA;
        const b = typeof branchB === 'number' ? this.branches[branchB] : branchB;
        if (!a || !b) {
            return null;
        }
        if (!a.points || a.points.length === 0) {
            return null;
        }
        const p = a.points[0];
        const line = b.lines[lineIndex];
        if (!line) {
            return null;
        }

        const start = line.start;
        const end = line.end;

        const seg = b.sub3(end, start);
        const ap = b.sub3(p, start);
        const segLen2 = b.dot3(seg, seg);
        let t = segLen2 < 1e-8 ? 0 : b.dot3(ap, seg) / segLen2;
        t = b.clamp(t, 0, 1);
        const proj = b.add3(start, b.mul3(seg, t));

        const conn = { fromBranch: this.branches.indexOf(a), toBranch: this.branches.indexOf(b), lineIndex, t, proj };
        this.connections.push(conn);
        return conn;
    }

    // Recompute projections after geometry changes
    updateConnections() {
        this.connections.forEach(conn => {
            const a = this.branches[conn.fromBranch];
            const b = this.branches[conn.toBranch];
            if (!a || !b || !a.points || a.points.length === 0) return;
            const p = a.points[0];
            const line = b.lines[conn.lineIndex];
            if (!line) return;

            const start = line.start;
            const end = line.end;
            const seg = b.sub3(end, start);
            const ap = b.sub3(p, start);
            const segLen2 = b.dot3(seg, seg);
            let t = segLen2 < 1e-8 ? 0 : b.dot3(ap, seg) / segLen2;
            t = b.clamp(t, 0, 1);
            conn.t = t;
            conn.proj = b.add3(start, b.mul3(seg, t));
        });
    }

    addMirrorBranch(branchIndex) {
        if (!this.branches || branchIndex < 0 || branchIndex >= this.branches.length) {
            return -1;
        }

        if (!this.mirrors) {
            this.mirrors = [];
        }

        const alreadyMirrored = this.mirrors.find(
            pair => pair.sourceBranch === branchIndex
        );

        if (alreadyMirrored) {
            return alreadyMirrored.mirrorBranch;
        }

        const sourceBranch = this.branches[branchIndex];
        if (!sourceBranch || !sourceBranch.points || sourceBranch.points.length === 0) {
            return -1;
        }

        const mirrorBranch = this.addBranch();

        sourceBranch.points.forEach(sourcePoint => {
            const mirroredPoint = mirrorBranch.addPoint(
                sourcePoint.x,
                sourcePoint.y,
                -(sourcePoint.z ?? 0)
            );

            mirroredPoint.diameter = sourcePoint.diameter;
        });

        for (let i = 1; i < mirrorBranch.points.length; i++) {
            mirrorBranch.addLine(
                mirrorBranch.points[i - 1],
                mirrorBranch.points[i]
            );
        }

        const mirrorBranchIndex = this.branches.indexOf(mirrorBranch);

        this.mirrors.push({
            sourceBranch: branchIndex,
            mirrorBranch: mirrorBranchIndex
        });

        return mirrorBranchIndex;
    }

    syncMirrorBranch(sourceBranchIndex) {
        if (!this.branches || !this.mirrors) return -1;
        if (sourceBranchIndex < 0 || sourceBranchIndex >= this.branches.length) return -1;

        const pair = this.mirrors.find(m => m.sourceBranch === sourceBranchIndex);
        if (!pair) return -1;

        const sourceBranch = this.branches[sourceBranchIndex];
        const mirrorBranch = this.branches[pair.mirrorBranch];

        if (!sourceBranch || !mirrorBranch) return -1;

        // remove old lines from mirror points
        if (mirrorBranch.lines) {
            mirrorBranch.lines.forEach(line => {
                if (line.start && line.start.lines) {
                    line.start.lines = line.start.lines.filter(l => l !== line);
                }
                if (line.end && line.end.lines) {
                    line.end.lines = line.end.lines.filter(l => l !== line);
                }
            });
        }

        // reset mirror branch geometry
        mirrorBranch.points = [];
        mirrorBranch.lines = [];

        // rebuild mirrored points
        sourceBranch.points.forEach(sourcePoint => {
            const mirroredPoint = mirrorBranch.addPoint(
                sourcePoint.x,
                sourcePoint.y,
                -(sourcePoint.z ?? 0)
            );

            mirroredPoint.diameter = sourcePoint.diameter;
        });

        // rebuild mirrored lines
        for (let i = 1; i < mirrorBranch.points.length; i++) {
            mirrorBranch.addLine(
                mirrorBranch.points[i - 1],
                mirrorBranch.points[i]
            );
        }

        return pair.mirrorBranch;
    }

    isMirrorBranch(branchIndex) {
        if (!this.mirrors) return false;
        return this.mirrors.some(m => m.mirrorBranch === branchIndex);
    }
}