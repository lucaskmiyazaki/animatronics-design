import { THREE } from './threeView.js';

class Chain3DView {
    constructor(sharedView) {
        this.view = sharedView;
        this.group = this.view.getOrCreateGroup('chainGroup');
    }

    clearChain() {
        this.view.clearGroup(this.group);
    }

    vec3(p) {
        return new THREE.Vector3(p.x, p.y, p.z ?? 0);
    }

    buildSquareBasis(normal, axis) {
        const n = normal.clone().normalize();
        const a = axis.clone().normalize();

        let u = a.clone().sub(n.clone().multiplyScalar(a.dot(n)));

        if (u.lengthSq() < 1e-8) {
            const ref = Math.abs(n.x) < 0.9
                ? new THREE.Vector3(1, 0, 0)
                : new THREE.Vector3(0, 1, 0);

            u = ref.clone().sub(n.clone().multiplyScalar(ref.dot(n)));
        }

        u.normalize();

        const v = new THREE.Vector3().crossVectors(n, u).normalize();

        return { u, v, n };
    }

    getSquareCorners(center, normal, axis, size) {
        const { u, v } = this.buildSquareBasis(normal, axis);
        const h = size / 2;

        return [
            center.clone().add(u.clone().multiplyScalar(-h)).add(v.clone().multiplyScalar(-h)),
            center.clone().add(u.clone().multiplyScalar( h)).add(v.clone().multiplyScalar(-h)),
            center.clone().add(u.clone().multiplyScalar( h)).add(v.clone().multiplyScalar( h)),
            center.clone().add(u.clone().multiplyScalar(-h)).add(v.clone().multiplyScalar( h))
        ];
    }

    reorderTopCorners(bottomCorners, topCorners) {
        const variants = [];

        // forward cyclic shifts
        for (let shift = 0; shift < 4; shift++) {
            variants.push([
                topCorners[(0 + shift) % 4],
                topCorners[(1 + shift) % 4],
                topCorners[(2 + shift) % 4],
                topCorners[(3 + shift) % 4]
            ]);
        }

        // reversed cyclic shifts
        const reversed = [topCorners[0], topCorners[3], topCorners[2], topCorners[1]];
        for (let shift = 0; shift < 4; shift++) {
            variants.push([
                reversed[(0 + shift) % 4],
                reversed[(1 + shift) % 4],
                reversed[(2 + shift) % 4],
                reversed[(3 + shift) % 4]
            ]);
        }

        let best = variants[0];
        let bestScore = Infinity;

        for (const candidate of variants) {
            let score = 0;
            for (let i = 0; i < 4; i++) {
                score += bottomCorners[i].distanceToSquared(candidate[i]);
            }

            if (score < bestScore) {
                bestScore = score;
                best = candidate;
            }
        }

        return best;
    }

    createSquareLoftMesh(link) {
        const bottomCenter = this.vec3(link.getBottomCenter());
        const topCenter = this.vec3(link.getTopCenter());

        const bottomNormal = this.vec3(link.getBottomNormal()).normalize();
        const topNormal = this.vec3(link.getTopNormal()).normalize();

        const axis = topCenter.clone().sub(bottomCenter).normalize();
        const size = link.diameter;

        const bottomCorners = this.getSquareCorners(bottomCenter, bottomNormal, axis, size);
        const rawTopCorners = this.getSquareCorners(topCenter, topNormal, axis, size);
        const topCorners = this.reorderTopCorners(bottomCorners, rawTopCorners);

        const positions = [];
        const indices = [];

        const addVertex = (p) => {
            positions.push(p.x, p.y, p.z);
            return positions.length / 3 - 1;
        };

        const b = bottomCorners.map(addVertex);
        const t = topCorners.map(addVertex);

        // side faces
        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;

            indices.push(b[i], b[j], t[j]);
            indices.push(b[i], t[j], t[i]);
        }

        // bottom face
        indices.push(b[0], b[2], b[1]);
        indices.push(b[0], b[3], b[2]);

        // top face
        indices.push(t[0], t[1], t[2]);
        indices.push(t[0], t[2], t[3]);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0xffaa33,
            side: THREE.DoubleSide
        });

        return new THREE.Mesh(geometry, material);
    }

    drawChain(chain, options = {}) {
        const { fitView = false } = options;

        this.clearChain();

        if (!chain || !chain.getLinks || chain.getLinks().length === 0) return;

        chain.getLinks().forEach(link => {
            const mesh = this.createSquareLoftMesh(link);
            this.group.add(mesh);
        });

        if (fitView || !this.view.hasFittedOnce) {
            this.view.fitCameraToObject(this.group);
            this.view.hasFittedOnce = true;
        }
    }

    drawChainsForSkeleton(skeleton, diameter = 20, options = {}) {
        const { fitView = false } = options;

        this.clearChain();

        if (!skeleton || !skeleton.branches || skeleton.branches.length === 0) return;

        skeleton.branches.forEach(branch => {
            if (!branch || !branch.points || branch.points.length < 2) return;

            const tempChain = new Chain();
            tempChain.buildFromSkeleton(branch, diameter);

            tempChain.getLinks().forEach(link => {
                const mesh = this.createSquareLoftMesh(link);
                this.group.add(mesh);
            });
        });

        if (fitView || !this.view.hasFittedOnce) {
            this.view.fitCameraToObject(this.group);
            this.view.hasFittedOnce = true;
        }
    }
}

window.chain3DView = new Chain3DView(window.skeleton3DView.view);