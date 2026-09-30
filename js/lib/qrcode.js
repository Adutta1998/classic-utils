"use strict";

/**
 * Minimal QR Code (model 2) encoder following ISO/IEC 18004.
 *
 * Supports numeric, alphanumeric and byte modes, versions 1–40 and all four
 * error-correction levels. Returns a boolean matrix — rendering is left to the
 * caller so the same output can drive a canvas or an SVG.
 */

const ECC_ORDER = { L: 0, M: 1, Q: 2, H: 3 };
const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

const ECC_CODEWORDS_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

const ECC_BLOCK_COUNT = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

const MODE = {
    numeric: { bits: 0b0001, countBits: [10, 12, 14] },
    alphanumeric: { bits: 0b0010, countBits: [9, 11, 13] },
    byte: { bits: 0b0100, countBits: [8, 16, 16] },
};

export class QrError extends Error {
    constructor(message) {
        super(message);
        this.name = "QrError";
    }
}

/* -------------------------------------------------------------------------- */
/* Galois field arithmetic                                                     */
/* -------------------------------------------------------------------------- */

function gfMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i -= 1) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
}

function rsDivisor(degree) {
    const result = new Uint8Array(degree);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i += 1) {
        for (let j = 0; j < degree; j += 1) {
            result[j] = gfMultiply(result[j], root);
            if (j + 1 < degree) result[j] ^= result[j + 1];
        }
        root = gfMultiply(root, 0x02);
    }
    return result;
}

function rsRemainder(data, divisor) {
    const result = new Uint8Array(divisor.length);
    for (const byte of data) {
        const factor = byte ^ result[0];
        result.copyWithin(0, 1);
        result[result.length - 1] = 0;
        for (let i = 0; i < result.length; i += 1) result[i] ^= gfMultiply(divisor[i], factor);
    }
    return result;
}

/* -------------------------------------------------------------------------- */
/* Capacity tables                                                             */
/* -------------------------------------------------------------------------- */

function rawDataModules(version) {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
        const alignCount = Math.floor(version / 7) + 2;
        result -= (25 * alignCount - 10) * alignCount - 55;
        if (version >= 7) result -= 36;
    }
    return result;
}

function dataCodewords(version, ecc) {
    return Math.floor(rawDataModules(version) / 8)
        - ECC_CODEWORDS_PER_BLOCK[ecc][version] * ECC_BLOCK_COUNT[ecc][version];
}

const countBitsFor = (mode, version) =>
    MODE[mode].countBits[version <= 9 ? 0 : version <= 26 ? 1 : 2];

function pickMode(text) {
    if (/^\d*$/.test(text)) return "numeric";
    if ([...text].every((char) => ALPHANUMERIC.includes(char))) return "alphanumeric";
    return "byte";
}

function segmentBitLength(mode, text, bytes, version) {
    const header = 4 + countBitsFor(mode, version);
    if (mode === "numeric") return header + Math.floor(text.length / 3) * 10 + [0, 4, 7][text.length % 3];
    if (mode === "alphanumeric") return header + Math.floor(text.length / 2) * 11 + (text.length % 2) * 6;
    return header + bytes.length * 8;
}

/* -------------------------------------------------------------------------- */
/* Bit stream                                                                  */
/* -------------------------------------------------------------------------- */

class BitBuffer {
    constructor() {
        this.bits = [];
    }

    push(value, length) {
        for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
    }

    get length() {
        return this.bits.length;
    }

    toBytes() {
        const bytes = new Uint8Array(Math.ceil(this.bits.length / 8));
        this.bits.forEach((bit, index) => {
            if (bit) bytes[index >>> 3] |= 0x80 >>> (index & 7);
        });
        return bytes;
    }
}

function encodeSegment(mode, text, bytes, version) {
    const buffer = new BitBuffer();
    buffer.push(MODE[mode].bits, 4);

    if (mode === "numeric") {
        buffer.push(text.length, countBitsFor(mode, version));
        for (let i = 0; i < text.length; i += 3) {
            const chunk = text.slice(i, i + 3);
            buffer.push(Number(chunk), chunk.length * 3 + 1);
        }
    } else if (mode === "alphanumeric") {
        buffer.push(text.length, countBitsFor(mode, version));
        for (let i = 0; i + 1 < text.length; i += 2) {
            buffer.push(ALPHANUMERIC.indexOf(text[i]) * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11);
        }
        if (text.length % 2 === 1) buffer.push(ALPHANUMERIC.indexOf(text[text.length - 1]), 6);
    } else {
        buffer.push(bytes.length, countBitsFor(mode, version));
        for (const byte of bytes) buffer.push(byte, 8);
    }
    return buffer;
}

function addEccAndInterleave(data, version, ecc) {
    const blockCount = ECC_BLOCK_COUNT[ecc][version];
    const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[ecc][version];
    const rawCodewords = Math.floor(rawDataModules(version) / 8);
    const shortBlockCount = blockCount - (rawCodewords % blockCount);
    const shortBlockLength = Math.floor(rawCodewords / blockCount);

    const divisor = rsDivisor(eccPerBlock);
    const blocks = [];
    for (let i = 0, offset = 0; i < blockCount; i += 1) {
        const length = shortBlockLength - eccPerBlock + (i < shortBlockCount ? 0 : 1);
        const block = data.slice(offset, offset + length);
        offset += length;
        blocks.push({ data: block, ecc: rsRemainder(block, divisor) });
    }

    const result = new Uint8Array(rawCodewords);
    let index = 0;
    for (let i = 0; i < shortBlockLength - eccPerBlock + 1; i += 1) {
        for (let b = 0; b < blocks.length; b += 1) {
            if (i < blocks[b].data.length) result[index++] = blocks[b].data[i];
        }
    }
    for (let i = 0; i < eccPerBlock; i += 1) {
        for (let b = 0; b < blocks.length; b += 1) result[index++] = blocks[b].ecc[i];
    }
    return result;
}

/* -------------------------------------------------------------------------- */
/* Matrix construction                                                         */
/* -------------------------------------------------------------------------- */

function alignmentPositions(version) {
    if (version === 1) return [];
    const count = Math.floor(version / 7) + 2;
    const size = version * 4 + 17;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    const positions = [6];
    for (let pos = size - 7; positions.length < count; pos -= step) positions.splice(1, 0, pos);
    return positions;
}

class Matrix {
    constructor(version) {
        this.version = version;
        this.size = version * 4 + 17;
        this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
        this.reserved = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    }

    setFunction(x, y, dark) {
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
        this.modules[y][x] = dark;
        this.reserved[y][x] = true;
    }

    drawFinder(centerX, centerY) {
        for (let dy = -4; dy <= 4; dy += 1) {
            for (let dx = -4; dx <= 4; dx += 1) {
                const distance = Math.max(Math.abs(dx), Math.abs(dy));
                this.setFunction(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
            }
        }
    }

    drawAlignment(centerX, centerY) {
        for (let dy = -2; dy <= 2; dy += 1) {
            for (let dx = -2; dx <= 2; dx += 1) {
                this.setFunction(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
        }
    }

    drawFunctionPatterns(ecc) {
        for (let i = 0; i < this.size; i += 1) {
            this.setFunction(6, i, i % 2 === 0);
            this.setFunction(i, 6, i % 2 === 0);
        }

        this.drawFinder(3, 3);
        this.drawFinder(this.size - 4, 3);
        this.drawFinder(3, this.size - 4);

        const positions = alignmentPositions(this.version);
        for (let i = 0; i < positions.length; i += 1) {
            for (let j = 0; j < positions.length; j += 1) {
                const skipCorner = (i === 0 && j === 0)
                    || (i === 0 && j === positions.length - 1)
                    || (i === positions.length - 1 && j === 0);
                if (!skipCorner) this.drawAlignment(positions[i], positions[j]);
            }
        }

        this.drawFormat(ecc, 0);
        this.drawVersion();
    }

    drawFormat(ecc, mask) {
        const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
        let remainder = data;
        for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
        const bits = (((data << 10) | remainder) ^ 0x5412) & 0x7fff;
        const bit = (index) => ((bits >>> index) & 1) !== 0;

        for (let i = 0; i <= 5; i += 1) this.setFunction(8, i, bit(i));
        this.setFunction(8, 7, bit(6));
        this.setFunction(8, 8, bit(7));
        this.setFunction(7, 8, bit(8));
        for (let i = 9; i < 15; i += 1) this.setFunction(14 - i, 8, bit(i));

        for (let i = 0; i < 8; i += 1) this.setFunction(this.size - 1 - i, 8, bit(i));
        for (let i = 8; i < 15; i += 1) this.setFunction(8, this.size - 15 + i, bit(i));
        this.setFunction(8, this.size - 8, true);
    }

    drawVersion() {
        if (this.version < 7) return;
        let remainder = this.version;
        for (let i = 0; i < 12; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
        const bits = (this.version << 12) | remainder;
        for (let i = 0; i < 18; i += 1) {
            const dark = ((bits >>> i) & 1) !== 0;
            const a = this.size - 11 + (i % 3);
            const b = Math.floor(i / 3);
            this.setFunction(a, b, dark);
            this.setFunction(b, a, dark);
        }
    }

    drawCodewords(codewords) {
        let index = 0;
        for (let right = this.size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (let vertical = 0; vertical < this.size; vertical += 1) {
                for (let j = 0; j < 2; j += 1) {
                    const x = right - j;
                    const upward = ((right + 1) & 2) === 0;
                    const y = upward ? this.size - 1 - vertical : vertical;
                    if (!this.reserved[y][x] && index < codewords.length * 8) {
                        this.modules[y][x] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) !== 0;
                        index += 1;
                    }
                }
            }
        }
    }

    applyMask(mask) {
        for (let y = 0; y < this.size; y += 1) {
            for (let x = 0; x < this.size; x += 1) {
                if (this.reserved[y][x]) continue;
                let invert;
                switch (mask) {
                    case 0: invert = (x + y) % 2 === 0; break;
                    case 1: invert = y % 2 === 0; break;
                    case 2: invert = x % 3 === 0; break;
                    case 3: invert = (x + y) % 3 === 0; break;
                    case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
                    case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
                    case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
                    default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
                }
                if (invert) this.modules[y][x] = !this.modules[y][x];
            }
        }
    }

    penalty() {
        const { size, modules } = this;
        let score = 0;

        const lines = [];
        for (let y = 0; y < size; y += 1) lines.push(modules[y].map((dark) => (dark ? "1" : "0")).join(""));
        for (let x = 0; x < size; x += 1) {
            let column = "";
            for (let y = 0; y < size; y += 1) column += modules[y][x] ? "1" : "0";
            lines.push(column);
        }

        // Rule 1: runs of five or more identical modules.
        for (const line of lines) {
            let runLength = 1;
            for (let i = 1; i <= line.length; i += 1) {
                if (i < line.length && line[i] === line[i - 1]) {
                    runLength += 1;
                } else {
                    if (runLength >= 5) score += 3 + (runLength - 5);
                    runLength = 1;
                }
            }
        }

        // Rule 2: 2×2 blocks of the same colour.
        for (let y = 0; y < size - 1; y += 1) {
            for (let x = 0; x < size - 1; x += 1) {
                const first = modules[y][x];
                if (first === modules[y][x + 1] && first === modules[y + 1][x] && first === modules[y + 1][x + 1]) {
                    score += 3;
                }
            }
        }

        // Rule 3: finder-like 1:1:3:1:1 patterns with four light modules beside them.
        for (const line of lines) {
            score += 40 * (countOccurrences(line, "10111010000") + countOccurrences(line, "00001011101"));
        }

        // Rule 4: deviation from an even distribution of dark modules.
        let dark = 0;
        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) if (modules[y][x]) dark += 1;
        }
        const percent = (dark * 100) / (size * size);
        score += 10 * Math.floor(Math.abs(percent - 50) / 5);
        return score;
    }
}

function countOccurrences(haystack, needle) {
    let count = 0;
    let index = haystack.indexOf(needle);
    while (index !== -1) {
        count += 1;
        index = haystack.indexOf(needle, index + 1);
    }
    return count;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Encodes `text` and returns `{ size, modules, version, ecc, mode, mask }`.
 * `modules[y][x]` is true for dark modules and excludes the quiet zone.
 */
export function encodeQr(text, { ecc = "M", minVersion = 1 } = {}) {
    if (!text) throw new QrError("There is nothing to encode.");
    if (!(ecc in ECC_ORDER)) throw new QrError(`Unknown error-correction level "${ecc}".`);

    const mode = pickMode(text);
    const bytes = new TextEncoder().encode(text);

    let version = 0;
    for (let candidate = Math.max(1, minVersion); candidate <= 40; candidate += 1) {
        if (segmentBitLength(mode, text, bytes, candidate) <= dataCodewords(candidate, ecc) * 8) {
            version = candidate;
            break;
        }
    }
    if (version === 0) {
        throw new QrError(`This content is too long for a QR code at level ${ecc}. Shorten it or lower the error correction.`);
    }

    const capacityBits = dataCodewords(version, ecc) * 8;
    const buffer = encodeSegment(mode, text, bytes, version);
    buffer.push(0, Math.min(4, capacityBits - buffer.length));
    buffer.push(0, (8 - (buffer.length % 8)) % 8);
    for (let pad = 0xec; buffer.length < capacityBits; pad ^= 0xec ^ 0x11) buffer.push(pad, 8);

    const codewords = addEccAndInterleave(buffer.toBytes(), version, ecc);

    const matrix = new Matrix(version);
    matrix.drawFunctionPatterns(ecc);
    matrix.drawCodewords(codewords);

    let bestMask = 0;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask += 1) {
        matrix.applyMask(mask);
        matrix.drawFormat(ecc, mask);
        const score = matrix.penalty();
        if (score < bestScore) {
            bestScore = score;
            bestMask = mask;
        }
        matrix.applyMask(mask);
    }
    matrix.applyMask(bestMask);
    matrix.drawFormat(ecc, bestMask);

    return {
        size: matrix.size,
        modules: matrix.modules,
        version,
        ecc,
        mode,
        mask: bestMask,
        capacity: dataCodewords(version, ecc),
    };
}

/** Builds a standalone SVG document for an encoded QR matrix. */
export function qrToSvg({ size, modules }, { scale = 8, margin = 4, dark = "#000000", light = "#ffffff" } = {}) {
    const dimension = (size + margin * 2) * scale;
    const parts = [];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            if (modules[y][x]) parts.push(`M${(x + margin) * scale} ${(y + margin) * scale}h${scale}v${scale}h-${scale}z`);
        }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${dimension}" height="${dimension}" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges">
  <rect width="${dimension}" height="${dimension}" fill="${light}"/>
  <path fill="${dark}" d="${parts.join("")}"/>
</svg>
`;
}
