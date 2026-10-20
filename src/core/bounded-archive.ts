import { Inflate } from "fflate";

export interface ArchivePolicy {
  label: string;
  maxArchiveBytes: number;
  maxExpandedBytes: number;
  minFiles: number;
  maxFiles: number;
  /** Exact allowlist with a decompressed byte limit for each path. */
  files: Readonly<Record<string, number>>;
  required: readonly string[];
  paired?: ReadonlyArray<readonly [string, string]>;
}
const decoder = new TextDecoder("utf-8", { fatal: true });
function fail(message: string): never {
  throw Error(message);
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let v = n;
  for (let b = 0; b < 8; b++) v = (v >>> 1) ^ (v & 1 ? 0xedb88320 : 0);
  return v >>> 0;
});
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (c >>> 8) ^ crcTable[(c ^ b) & 255];
  return (c ^ 0xffffffff) >>> 0;
}

/** Bound every allocation before inflation; accept only our documented file paths. */
export function readBoundedArchive(
  bytes: Uint8Array,
  policy: ArchivePolicy,
): Record<string, Uint8Array> {
  if (bytes.length < 22 || bytes.length > policy.maxArchiveBytes)
    fail(
      `${policy.label} must be intact and at most ${policy.maxArchiveBytes} bytes.`,
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (
      view.getUint32(p, true) === 0x06054b50 &&
      p + 22 + view.getUint16(p + 20, true) === bytes.length
    ) {
      end = p;
      break;
    }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    fail("Invalid or multi-volume ZIP directory.");
  const count = view.getUint16(end + 10, true),
    directory = view.getUint32(end + 16, true);
  if (
    count !== view.getUint16(end + 8, true) ||
    count > policy.maxFiles ||
    count < policy.minFiles
  )
    fail("ZIP contains an unexpected number of files.");
  if (directory + view.getUint32(end + 12, true) !== end)
    fail("Invalid ZIP directory bounds; ZIP64 is unsupported.");
  const entries: Array<{
    name: string;
    size: number;
    compressed: number;
    start: number;
    method: number;
    crc: number;
  }> = [];
  const names = new Set<string>(),
    ranges: Array<[number, number]> = [];
  let offset = directory,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      fail("Invalid ZIP entry.");
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true),
      crc = view.getUint32(offset + 16, true),
      compressed = view.getUint32(offset + 20, true),
      size = view.getUint32(offset + 24, true),
      nl = view.getUint16(offset + 28, true),
      el = view.getUint16(offset + 30, true),
      cl = view.getUint16(offset + 32, true),
      local = view.getUint32(offset + 42, true);
    const next = offset + 46 + nl + el + cl;
    if (next > end || view.getUint16(offset + 34, true))
      fail("Invalid ZIP entry bounds.");
    let name: string;
    try {
      name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nl));
    } catch {
      fail("ZIP filenames must be valid UTF-8.");
    }
    if (!Object.hasOwn(policy.files, name))
      fail(`Unexpected ZIP path ${JSON.stringify(name)}.`);
    if (names.has(name)) fail(`Duplicate ZIP file ${name}.`);
    names.add(name);
    if (flags & ~0x080e || ![0, 8].includes(method))
      fail("Encrypted or unsupported ZIP compression.");
    if (
      !size ||
      size > policy.files[name] ||
      (total += size) > policy.maxExpandedBytes
    )
      fail(`${name} exceeds the uncompressed size limit.`);
    if (local + 30 > directory || view.getUint32(local, true) !== 0x04034b50)
      fail(`Invalid local ZIP header for ${name}.`);
    if (
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method
    )
      fail(`Inconsistent ZIP headers for ${name}.`);
    const localNl = view.getUint16(local + 26, true),
      start = local + 30 + localNl + view.getUint16(local + 28, true);
    if (
      start + compressed > directory ||
      localNl !== nl ||
      !bytes
        .subarray(local + 30, local + 30 + localNl)
        .every((v, j) => v === bytes[offset + 46 + j])
    )
      fail(`Invalid ZIP filename/data for ${name}.`);
    if (
      !(flags & 8) &&
      (view.getUint32(local + 14, true) !== crc ||
        view.getUint32(local + 18, true) !== compressed ||
        view.getUint32(local + 22, true) !== size)
    )
      fail(`Inconsistent ZIP sizes/checksum for ${name}.`);
    if (ranges.some(([a, b]) => local < b && start + compressed > a))
      fail("Overlapping ZIP entries.");
    ranges.push([local, start + compressed]);
    entries.push({ name, start, compressed, size, method, crc });
    offset = next;
  }
  if (offset !== end || policy.required.some((name) => !names.has(name)))
    fail("ZIP is missing its metadata or has invalid directory size.");
  for (const [a, b] of policy.paired ?? [])
    if (names.has(a) !== names.has(b))
      fail("Template guides and instructions must be supplied together.");
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    const compressed = bytes.subarray(
      entry.start,
      entry.start + entry.compressed,
    );
    let output: Uint8Array;
    if (!entry.method) output = compressed;
    else {
      output = new Uint8Array(entry.size);
      let written = 0;
      try {
        const inflate = new Inflate((chunk) => {
          if (written + chunk.length > output.length)
            fail("Inflation exceeds declared size.");
          output.set(chunk, written);
          written += chunk.length;
        });
        if (!compressed.length) fail("Empty compressed data.");
        for (let i = 0; i < compressed.length; i += 1024)
          inflate.push(
            compressed.subarray(i, i + 1024),
            i + 1024 >= compressed.length,
          );
      } catch {
        fail(`${entry.name} cannot be decompressed within its declared size.`);
      }
      if (written !== entry.size) fail(`${entry.name} failed its size check.`);
    }
    if (output.length !== entry.size || crc32(output) !== entry.crc)
      fail(`${entry.name} failed its checksum or size check.`);
    files[entry.name] = output;
  }
  return files;
}
