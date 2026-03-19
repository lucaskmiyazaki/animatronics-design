class Link {
    constructor(length, diameter, normal1, normal2) {
        this.length = length;
        this.diameter = diameter;
        this.radius = diameter / 2;

        this.position = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };

        this.normal1 = normal1;
        this.normal2 = normal2;
    }

    setPosition(x, y, z) {
        this.position = { x, y, z };
    }

    setRotation(rx, ry, rz) {
        this.rotation = { x: rx, y: ry, z: rz };
    }

    rotateVector(v) {
        let { x, y, z } = v;

        const cx = Math.cos(this.rotation.x);
        const sx = Math.sin(this.rotation.x);
        const cy = Math.cos(this.rotation.y);
        const sy = Math.sin(this.rotation.y);
        const cz = Math.cos(this.rotation.z);
        const sz = Math.sin(this.rotation.z);

        // rotate around X
        let x1 = x;
        let y1 = y * cx - z * sx;
        let z1 = y * sx + z * cx;

        // rotate around Y
        let x2 = x1 * cy + z1 * sy;
        let y2 = y1;
        let z2 = -x1 * sy + z1 * cy;

        // rotate around Z
        let x3 = x2 * cz - y2 * sz;
        let y3 = x2 * sz + y2 * cz;
        let z3 = z2;

        return { x: x3, y: y3, z: z3 };
    }

    getBottomNormal() {
        return this.rotateVector(this.normal1);
    }

    getTopNormal() {
        return this.rotateVector(this.normal2);
    }

    getBottomCenter() {
        return {
            x: this.position.x,
            y: this.position.y,
            z: this.position.z
        };
    }

    getTopCenter() {
        const axis = this.rotateVector({ x: 1, y: 0, z: 0 });

        return {
            x: this.position.x + axis.x * this.length,
            y: this.position.y + axis.y * this.length,
            z: this.position.z + axis.z * this.length
        };
    }

    // 2D helpers
    add2D(a, b) {
        return { x: a.x + b.x, y: a.y + b.y };
    }

    sub2D(a, b) {
        return { x: a.x - b.x, y: a.y - b.y };
    }

    mul2D(v, s) {
        return { x: v.x * s, y: v.y * s };
    }

    normalize2D(v) {
        const m = Math.hypot(v.x, v.y);
        if (m < 1e-8) return { x: 1, y: 0 };
        return { x: v.x / m, y: v.y / m };
    }

    perpendicular2D(v) {
        return { x: -v.y, y: v.x };
    }

    cross2D(a, b) {
        return a.x * b.y - a.y * b.x;
    }

    intersectLines(p1, d1, p2, d2) {
        const denom = this.cross2D(d1, d2);

        if (Math.abs(denom) < 1e-8) {
            return { x: p1.x, y: p1.y };
        }

        const diff = this.sub2D(p2, p1);
        const t = this.cross2D(diff, d2) / denom;

        return this.add2D(p1, this.mul2D(d1, t));
    }

    static subtract(a, b) {
        return {
            x: a.x - b.x,
            y: a.y - b.y,
            z: a.z - b.z
        };
    }

    static add(a, b) {
        return {
            x: a.x + b.x,
            y: a.y + b.y,
            z: a.z + b.z
        };
    }

    static multiply(v, s) {
        return {
            x: v.x * s,
            y: v.y * s,
            z: v.z * s
        };
    }

    static magnitude(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    }

    static normalize(v) {
        const m = Link.magnitude(v);

        if (m < 1e-8) {
            return { x: 0, y: 0, z: 0 };
        }

        return {
            x: v.x / m,
            y: v.y / m,
            z: v.z / m
        };
    }

    // ADDED: compute the rotation that aligns P1P2 with local +X
    static rotationFromXAxis(axis) {
        const d = Link.normalize(axis);

        const rz = Math.atan2(d.y, d.x);
        const xyLen = Math.sqrt(d.x * d.x + d.y * d.y);
        const ry = Math.atan2(-d.z, xyLen);

        return { x: 0, y: ry, z: rz };
    }

    // ADDED: inverse-rotate a vector by a given rotation
    static inverseRotateVectorWithRotation(v, rotation) {
        let { x, y, z } = v;

        const cz = Math.cos(-rotation.z);
        const sz = Math.sin(-rotation.z);
        const cy = Math.cos(-rotation.y);
        const sy = Math.sin(-rotation.y);
        const cx = Math.cos(-rotation.x);
        const sx = Math.sin(-rotation.x);

        // undo Z
        let x1 = x * cz - y * sz;
        let y1 = x * sz + y * cz;
        let z1 = z;

        // undo Y
        let x2 = x1 * cy + z1 * sy;
        let y2 = y1;
        let z2 = -x1 * sy + z1 * cy;

        // undo X
        let x3 = x2;
        let y3 = y2 * cx - z2 * sx;
        let z3 = y2 * sx + z2 * cx;

        return { x: x3, y: y3, z: z3 };
    }

    static fromFourPoints(P0, P1, P2, P3, diameter) {
        const axis = Link.subtract(P2, P1);
        const length = Link.magnitude(axis);
        
        if (length < 1e-8) {
            return null;
        }
    
        const rotation = Link.rotationFromXAxis(axis);
        const localAxis = { x: 1, y: 0, z: 0 };
    
        let normal1;
        if (P0 == null) {
            normal1 = localAxis;
        } else {
            const d10 = Link.normalize(
                Link.inverseRotateVectorWithRotation(
                    Link.subtract(P0, P1),
                    rotation
                )
            );
        
            const d12 = Link.normalize(
                Link.inverseRotateVectorWithRotation(
                    Link.subtract(P2, P1),
                    rotation
                )
            );
        
            normal1 = Link.normalize(Link.subtract(d10, d12));
        
            if (Link.magnitude(normal1) < 1e-8) {
                normal1 = localAxis;
            }
        }
    
        let normal2;
        if (P3 == null) {
            normal2 = localAxis;
        } else {
            const d21 = Link.normalize(
                Link.inverseRotateVectorWithRotation(
                    Link.subtract(P1, P2),
                    rotation
                )
            );
        
            const d23 = Link.normalize(
                Link.inverseRotateVectorWithRotation(
                    Link.subtract(P3, P2),
                    rotation
                )
            );
        
            normal2 = Link.normalize(Link.subtract(d21, d23));
        
            if (Link.magnitude(normal2) < 1e-8) {
                normal2 = localAxis;
            }
        }
    
        const link = new Link(length, diameter, normal1, normal2);
        link.setPosition(P1.x, P1.y, P1.z);
        link.setRotation(rotation.x, rotation.y, rotation.z);
    
        return link;
    }

    getXYProjection() {
        const bottom3D = this.getBottomCenter();
        const top3D = this.getTopCenter();

        const bottomCenter = { x: bottom3D.x, y: bottom3D.y };
        const topCenter = { x: top3D.x, y: top3D.y };

        const axis2D = this.sub2D(topCenter, bottomCenter);
        const axisDir = this.normalize2D(axis2D);
        const offsetDir = this.perpendicular2D(axisDir);

        const halfThickness = this.diameter / 2;

        const bottomNormal2D = this.normalize2D({
            x: this.getBottomNormal().x,
            y: this.getBottomNormal().y
        });

        const topNormal2D = this.normalize2D({
            x: this.getTopNormal().x,
            y: this.getTopNormal().y
        });

        // side lines are perpendicular to normals
        const bottomSideDir = this.perpendicular2D(bottomNormal2D);
        const topSideDir = this.perpendicular2D(topNormal2D);

        // upper and lower rails
        const upperRailPoint = this.add2D(
            bottomCenter,
            this.mul2D(offsetDir, halfThickness)
        );

        const lowerRailPoint = this.add2D(
            bottomCenter,
            this.mul2D(offsetDir, -halfThickness)
        );

        const upperRailDir = axisDir;
        const lowerRailDir = axisDir;

        // 4 intersections
        const p1 = this.intersectLines(
            bottomCenter,
            bottomSideDir,
            upperRailPoint,
            upperRailDir
        );

        const p2 = this.intersectLines(
            topCenter,
            topSideDir,
            upperRailPoint,
            upperRailDir
        );

        const p3 = this.intersectLines(
            topCenter,
            topSideDir,
            lowerRailPoint,
            lowerRailDir
        );

        const p4 = this.intersectLines(
            bottomCenter,
            bottomSideDir,
            lowerRailPoint,
            lowerRailDir
        );

        return [p1, p2, p3, p4];
    }
}

class Chain {
    constructor() {
        this.links = [];
    }

    clear() {
        this.links = [];
    }

    getLinks() {
        return this.links;
    }

    static pointTo3D(point) {
        return {
            x: point.x,
            y: point.y,
            z: point.z ?? 0
        };
    }

    buildFromSkeleton(skeleton, diameter = 20) {
        this.clear();

        if (!skeleton || skeleton.points.length < 2) {
            return this.links;
        }

        const pts = skeleton.points;

        for (let i = 0; i < pts.length - 1; i++) {
            const P0 = i > 0 ? Chain.pointTo3D(pts[i - 1]) : null;
            const P1 = Chain.pointTo3D(pts[i]);
            const P2 = Chain.pointTo3D(pts[i + 1]);
            const P3 = i + 2 < pts.length ? Chain.pointTo3D(pts[i + 2]) : null;

            const link = Link.fromFourPoints(P0, P1, P2, P3, diameter);

            if (link) {
                this.links.push(link);
            }
        }

        return this.links;
    }
}