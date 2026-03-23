import { THREE } from './threeView.js';
import {
    mergeGeometries,
    mergeVertices
} from 'https://esm.sh/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';
import { STLExporter } from 'https://esm.sh/three@0.160.0/examples/jsm/exporters/STLExporter.js';
import { CSG } from 'https://esm.sh/three-csg-ts';

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

    getSignedVolume(mesh) {
        const g = mesh.geometry;
        const pos = g.attributes.position;
        const index = g.index;

        let volume = 0;

        const vA = new THREE.Vector3();
        const vB = new THREE.Vector3();
        const vC = new THREE.Vector3();

        const read = (i, v) => v.fromBufferAttribute(pos, i);

        if (index) {
            for (let i = 0; i < index.count; i += 3) {
                read(index.getX(i), vA);
                read(index.getX(i + 1), vB);
                read(index.getX(i + 2), vC);

                volume += vA.dot(vB.clone().cross(vC)) / 6;
            }
        } else {
            for (let i = 0; i < pos.count; i += 3) {
                read(i, vA);
                read(i + 1, vB);
                read(i + 2, vC);

                volume += vA.dot(vB.clone().cross(vC)) / 6;
            }
        }

        return volume;
    }

    flipGeometryWinding(geometry) {
        if (!geometry.index) return;

        const index = geometry.index;

        for (let i = 0; i < index.count; i += 3) {
            const b = index.getX(i + 1);
            const c = index.getX(i + 2);

            index.setX(i + 1, c);
            index.setX(i + 2, b);
        }

        index.needsUpdate = true;
        geometry.computeVertexNormals();
    }

    mergeMeshes(meshes) {
        if (meshes.length === 0) return null;

        const prepared = meshes.map(mesh => {
            const clone = mesh.clone();
            clone.geometry = mesh.geometry.clone();

            clone.updateMatrixWorld(true);
            clone.geometry.applyMatrix4(clone.matrixWorld);

            clone.matrix.identity();
            clone.matrixWorld.identity();

            const vol = this.getSignedVolume(clone);
            if (vol < 0) {
                this.flipGeometryWinding(clone.geometry);
            }

            clone.geometry = this.cleanGeometry(clone.geometry);
            return clone;
        });

        let result = prepared[0];

        for (let i = 1; i < prepared.length; i++) {
            result = CSG.union(result, prepared[i]);
            result.geometry = this.cleanGeometry(result.geometry);
        }

        return result;
    }

    cleanGeometry(geometry, tolerance = 1e-5) {
        let g = geometry.clone();

        if (g.index) {
            g = g.toNonIndexed();
        }

        g = mergeVertices(g, tolerance);
        g.computeVertexNormals();
        g.computeBoundingBox();
        g.computeBoundingSphere();

        return g;
    }

    createHolePrismForLink(link, holeDiameterRatio = 0.2) {
        const bottomCenter = this.vec3(link.getBottomCenter());
        const topCenter = this.vec3(link.getTopCenter());

        const axis = topCenter.clone().sub(bottomCenter);
        const height = axis.length();

        if (height < 1e-8) return null;

        const holeSize = link.diameter * holeDiameterRatio;

        const geometry = new THREE.BoxGeometry(
            holeSize,
            height,
            holeSize
        );

        const material = new THREE.MeshStandardMaterial({ color: 0x8888ff });
        const prism = new THREE.Mesh(geometry, material);

        const mid = bottomCenter.clone().add(topCenter).multiplyScalar(0.5);
        prism.position.copy(mid);

        // BoxGeometry is aligned with Y by default
        const yAxis = new THREE.Vector3(0, 1, 0);
        const dir = axis.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dir);
        prism.quaternion.copy(quat);

        prism.updateMatrixWorld(true);

        return prism;
    }

    prepareMeshForCSG(mesh) {
        const clone = mesh.clone();
        clone.geometry = mesh.geometry.clone();

        clone.updateMatrixWorld(true);
        clone.geometry.applyMatrix4(clone.matrixWorld);

        clone.matrix.identity();
        clone.matrixWorld.identity();

        const vol = this.getSignedVolume(clone);
        if (vol < 0) {
            this.flipGeometryWinding(clone.geometry);
        }

        clone.geometry.computeVertexNormals();
        return clone;
    }

    subtractHolesFromMesh(mesh, links, holeDiameterRatio = 0.2) {
        let result = this.prepareMeshForCSG(mesh);

        links.forEach(link => {
            const hole = this.createHolePrismForLink(link, holeDiameterRatio);
            if (!hole) return;

            result = CSG.subtract(result, hole);

            //const vol = this.getSignedVolume(result);
            //if (vol < 0) {
            //    this.flipGeometryWinding(result.geometry);
            //}

            result.geometry = this.cleanGeometry(result.geometry);
        });

        return result;
    }

    createPointCapCylinder(link, pointDiameter = 50, thickness = 10) {
        if (!link) return null;

        const bottomCenter = this.vec3(link.getBottomCenter());
        const topCenter = this.vec3(link.getTopCenter());
        const bottomNormal = this.vec3(link.getBottomNormal()).clone().normalize();

        const radius = pointDiameter / 2;

        const geometry = new THREE.CylinderGeometry(radius, radius, thickness, 24);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide
        });

        const cylinder = new THREE.Mesh(geometry, material);

        const yAxis = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, bottomNormal);
        cylinder.quaternion.copy(quat);

        const inwardDir = topCenter.clone().sub(bottomCenter).normalize();
        const sign = bottomNormal.dot(inwardDir) >= 0 ? 1 : -1;

        const inwardOffset = bottomNormal.clone().multiplyScalar(sign * thickness * 0.5);
        cylinder.position.copy(bottomCenter).add(inwardOffset);

        cylinder.updateMatrixWorld(true);
        return cylinder;
    }

    createEndPointCapCylinder(link, pointDiameter = 50, thickness = 10) {
        if (!link) return null;

        const bottomCenter = this.vec3(link.getBottomCenter());
        const topCenter = this.vec3(link.getTopCenter());
        const topNormal = this.vec3(link.getTopNormal()).clone().normalize();

        const radius = pointDiameter / 2;

        const geometry = new THREE.CylinderGeometry(radius, radius, thickness, 24);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide
        });

        const cylinder = new THREE.Mesh(geometry, material);

        const yAxis = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, topNormal);
        cylinder.quaternion.copy(quat);

        const inwardDir = bottomCenter.clone().sub(topCenter).normalize();
        const sign = topNormal.dot(inwardDir) >= 0 ? 1 : -1;

        const inwardOffset = topNormal.clone().multiplyScalar(sign * thickness * 0.5);
        cylinder.position.copy(topCenter).add(inwardOffset);

        cylinder.updateMatrixWorld(true);
        return cylinder;
    }

        drawChainsForSkeleton(skeleton, diameter = 20, options = {}) {
        const { fitView = false } = options;

        this.clearChain();

        if (!skeleton || !skeleton.branches || skeleton.branches.length === 0) return;

        const meshMap = new Map();
        const consumedKeys = new Set();
        const finalMeshes = [];
        const capThickness = 10;

        // 1) Build each link mesh already merged with its point cap cylinder(s)
        skeleton.branches.forEach((branch, branchIndex) => {
            if (!branch || !branch.points || branch.points.length < 2) return;

            const tempChain = new Chain();
            tempChain.buildFromSkeleton(branch, diameter);

            const links = tempChain.getLinks();

            links.forEach((link, linkIndex) => {
                const parts = [];

                const loftMesh = this.createSquareLoftMesh(link);
                parts.push(loftMesh);

                const startPoint = branch.points[linkIndex];
                const startDiameter = startPoint?.diameter ?? diameter;
                const startCylinder = this.createPointCapCylinder(
                    link,
                    startDiameter,
                    capThickness
                );

                if (startCylinder) {
                    parts.push(startCylinder);
                }

                const isLastLink = linkIndex === links.length - 1;
                if (isLastLink) {
                    const endPoint = branch.points[linkIndex + 1];
                    const endDiameter = endPoint?.diameter ?? diameter;
                    const endCylinder = this.createEndPointCapCylinder(
                        link,
                        endDiameter,
                        capThickness
                    );

                    if (endCylinder) {
                        parts.push(endCylinder);
                    }
                }

                let mergedLinkMesh = this.mergeMeshes(parts);
                mergedLinkMesh.userData.branchIndex = branchIndex;
                mergedLinkMesh.userData.linkIndex = linkIndex;
                mergedLinkMesh.userData.link = link;

                this.meshes.push(mergedLinkMesh);

                const key = `${branchIndex}:${linkIndex}`;
                meshMap.set(key, mergedLinkMesh);
            });
        });

        // 2) Merge only exact connected pairs, then subtract holes
        console.log('Skeleton link connections:');

        (skeleton.connections || []).forEach((conn, connIndex) => {
            const childBranchIndex = conn.fromBranch;
            const parentBranchIndex = conn.toBranch;
            const parentLinkIndex = conn.lineIndex;
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

            let mergedMesh = this.mergeMeshes([childMesh, parentMesh]);

            mergedMesh = this.subtractHolesFromMesh(
                mergedMesh,
                [childMesh.userData.link, parentMesh.userData.link],
                0.2
            );

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

        // 3) Add all unmerged meshes, subtracting their own hole
        this.meshes.forEach(mesh => {
            const key = `${mesh.userData.branchIndex}:${mesh.userData.linkIndex}`;

            if (!consumedKeys.has(key)) {
                const holedMesh = this.subtractHolesFromMesh(
                    mesh,
                    [mesh.userData.link],
                    0.2
                );

                holedMesh.userData = { ...mesh.userData };
                finalMeshes.push(holedMesh);
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

    downloadBlob(filename, text) {
        const blob = new Blob([text], { type: 'model/stl' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        
        URL.revokeObjectURL(url);
    }
    
    downloadFinalMeshesAsSTL(prefix = 'mesh') {
        const exporter = new STLExporter();
        const finalMeshes = this.group.children.filter(obj => obj.isMesh);
    
        console.log(`Exporting ${finalMeshes.length} final meshes...`);
    
        finalMeshes.forEach((mesh, i) => {
            const stlString = exporter.parse(mesh, { binary: false });
        
            const d = mesh.userData || {};
            let name = `${prefix}_${i}`;
        
            if (d.mergedConnection) {
                name = `merged_B${d.mergedConnection.fromBranch}_L${d.mergedConnection.fromLink}__B${d.mergedConnection.toBranch}_L${d.mergedConnection.toLink}`;
            } else if (d.branchIndex != null && d.linkIndex != null) {
                name = `branch_${d.branchIndex}_link_${d.linkIndex}`;
            }
        
            this.downloadBlob(`${name}.stl`, stlString);
        });
    }
}

window.chain3DView = new Chain3DView(window.skeleton3DView.view);