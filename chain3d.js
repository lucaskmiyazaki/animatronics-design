import { THREE } from './threeView.js';
import { mergeGeometries } from 'https://esm.sh/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';

class Chain3DView {
    constructor(sharedView) {
        this.view = sharedView;
        this.group = this.view.getOrCreateGroup('chainGroup');
        this.meshes = [];
    }

    clearChain() {
        this.view.clearGroup(this.group);
        this.meshes = [];
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

        for (let shift = 0; shift < 4; shift++) {
            variants.push([
                topCorners[(0 + shift) % 4],
                topCorners[(1 + shift) % 4],
                topCorners[(2 + shift) % 4],
                topCorners[(3 + shift) % 4]
            ]);
        }

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

        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;

            indices.push(b[i], b[j], t[j]);
            indices.push(b[i], t[j], t[i]);
        }

        indices.push(b[0], b[2], b[1]);
        indices.push(b[0], b[3], b[2]);

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

    buildBranchAdjacency(skeleton) {
        const adjacency = new Map();

        for (let i = 0; i < skeleton.branches.length; i++) {
            adjacency.set(i, new Set());
        }

        (skeleton.connections || []).forEach(conn => {
            if (
                conn.fromBranch == null ||
                conn.toBranch == null ||
                conn.fromBranch < 0 ||
                conn.toBranch < 0
            ) return;

            adjacency.get(conn.fromBranch).add(conn.toBranch);
            adjacency.get(conn.toBranch).add(conn.fromBranch);
        });

        return adjacency;
    }

    findBranchComponents(skeleton) {
        const adjacency = this.buildBranchAdjacency(skeleton);
        const visited = new Set();
        const components = [];

        for (let i = 0; i < skeleton.branches.length; i++) {
            if (visited.has(i)) continue;

            const stack = [i];
            const component = [];

            visited.add(i);

            while (stack.length > 0) {
                const current = stack.pop();
                component.push(current);

                for (const neighbor of adjacency.get(current)) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        stack.push(neighbor);
                    }
                }
            }

            components.push(component);
        }

        return components;
    }

    mergeMeshes(meshes) {
        if (!meshes || meshes.length === 0) return null;
        if (meshes.length === 1) return meshes[0];

        const geometries = meshes.map(m => {
            const g = m.geometry.clone();
            g.applyMatrix4(m.matrixWorld);
            return g;
        });

        const mergedGeometry = mergeGeometries(geometries, true);
        mergedGeometry.computeVertexNormals();

        const material = meshes[0].material.clone();
        return new THREE.Mesh(mergedGeometry, material);
    }

    drawChainsForSkeleton(skeleton, diameter = 20, options = {}) {
        const { fitView = false } = options;

        this.clearChain();

        if (!skeleton || !skeleton.branches || skeleton.branches.length === 0) return;

        const meshMap = new Map();
        const consumedKeys = new Set();
        const finalMeshes = [];

        // 1) Build all link meshes first
        skeleton.branches.forEach((branch, branchIndex) => {
            if (!branch || !branch.points || branch.points.length < 2) return;

            const tempChain = new Chain();
            tempChain.buildFromSkeleton(branch, diameter);

            tempChain.getLinks().forEach((link, linkIndex) => {
                const mesh = this.createSquareLoftMesh(link);

                mesh.userData.branchIndex = branchIndex;
                mesh.userData.linkIndex = linkIndex;
                mesh.userData.link = link;

                this.meshes.push(mesh);

                const key = `${branchIndex}:${linkIndex}`;
                meshMap.set(key, mesh);
            });
        });

        // 2) Merge only the exact connected pairs
        console.log('Skeleton link connections:');

        (skeleton.connections || []).forEach((conn, connIndex) => {
            const childBranchIndex = conn.fromBranch;
            const parentBranchIndex = conn.toBranch;
            const parentLinkIndex = conn.lineIndex;

            // by your skeleton logic, the attached point is the first point of child branch,
            // so the touching child link is assumed to be link 0
            const childLinkIndex = 0;

            const childKey = `${childBranchIndex}:${childLinkIndex}`;
            const parentKey = `${parentBranchIndex}:${parentLinkIndex}`;

            const childMesh = meshMap.get(childKey);
            const parentMesh = meshMap.get(parentKey);

            console.log(
                `[${connIndex}] B${childBranchIndex}-L${childLinkIndex} <-> B${parentBranchIndex}-L${parentLinkIndex}`,
                conn
            );

            if (!childMesh || !parentMesh) {
                console.warn(
                    `Connection ${connIndex} could not be merged because one mesh was not found.`,
                    { childKey, parentKey }
                );
                return;
            }

            if (consumedKeys.has(childKey) || consumedKeys.has(parentKey)) {
                console.warn(
                    `Connection ${connIndex} skipped because one of the links was already merged.`,
                    { childKey, parentKey }
                );
                return;
            }

            const mergedMesh = this.mergeMeshes([childMesh, parentMesh]);
            mergedMesh.userData.mergedConnection = {
                connectionIndex: connIndex,
                fromBranch: childBranchIndex,
                fromLink: childLinkIndex,
                toBranch: parentBranchIndex,
                toLink: parentLinkIndex
            };

            finalMeshes.push(mergedMesh);

            consumedKeys.add(childKey);
            consumedKeys.add(parentKey);
        });

        // 3) Add all meshes that were not merged
        this.meshes.forEach(mesh => {
            const key = `${mesh.userData.branchIndex}:${mesh.userData.linkIndex}`;
            if (!consumedKeys.has(key)) {
                finalMeshes.push(mesh);
            }
        });

        // 4) Add everything to group
        finalMeshes.forEach(mesh => {
            this.group.add(mesh);
        });

        console.log('Final meshes:');

        this.group.children.forEach((mesh, i) => {
            const d = mesh.userData || {};
        
            console.log(
                `#${i}`,
                d.mergedConnection
                    ? `MERGED: B${d.mergedConnection.fromBranch}-L${d.mergedConnection.fromLink} <-> B${d.mergedConnection.toBranch}-L${d.mergedConnection.toLink}`
                    : `SINGLE: B${d.branchIndex}-L${d.linkIndex}`
            );
        });
        
        if (fitView || !this.view.hasFittedOnce) {
            this.view.fitCameraToObject(this.group);
            this.view.hasFittedOnce = true;
        }
    }
}

window.chain3DView = new Chain3DView(window.skeleton3DView.view);